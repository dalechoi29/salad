"use server";

import { createClient, createAdminClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, DailySaladStatus } from "@/types";
import { formatDateISO, getKSTDate } from "@/lib/utils";

const ADMIN_ROLES = ["admin", "super_admin"];
const SUPER_ADMIN_ROLES = ["super_admin"];

async function getCallerRole(): Promise<string | null> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return data?.role ?? null;
}

function isAnyAdmin(role: string | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

function isSuperAdmin(role: string | null): boolean {
  return !!role && SUPER_ADMIN_ROLES.includes(role);
}

async function hasPermission(permission: string): Promise<boolean> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") return true;
  if (profile?.role !== "admin") return false;

  // Read admin_permissions via service role client. The `admin_permissions`
  // RLS policy only allows super_admin reads, which would otherwise prevent
  // a regular admin from seeing their own permissions. We scope by the
  // authenticated user's own id, so there is no data leak.
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_permissions")
    .select("id")
    .eq("user_id", user.id)
    .eq("permission", permission)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

export async function getCallerAdminRole(): Promise<"super_admin" | "admin" | null> {
  const role = await getCallerRole();
  if (!role) return null;
  if (role === "super_admin") return "super_admin";
  if (role === "admin") return "admin";
  return null;
}

// ─── Permission System ──────────────────────────────────────

import { ALL_PERMISSIONS } from "@/lib/permissions";

export async function getUserPermissions(userId: string): Promise<string[]> {
  // Use service role to bypass RLS. `admin_permissions` restricts reads to
  // super_admin, which blocks regular admins from loading their own perms.
  // Safe: we only fetch the single user id passed in by server-side callers.
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_permissions")
    .select("permission")
    .eq("user_id", userId);
  return (data ?? []).map((r: any) => r.permission);
}

export async function getMyPermissions(): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    return ALL_PERMISSIONS.map((p) => p.key);
  }
  if (profile?.role !== "admin") return [];

  return getUserPermissions(user.id);
}

export async function updateUserPermissions(
  userId: string,
  permissions: string[]
): Promise<ActionResult> {
  const role = await getCallerRole();
  if (!isSuperAdmin(role)) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  await supabase.from("admin_permissions").delete().eq("user_id", userId);

  if (permissions.length > 0) {
    const rows = permissions.map((permission) => ({
      user_id: userId,
      permission,
    }));
    const { error } = await supabase.from("admin_permissions").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function getAdminUsersList(): Promise<
  { id: string; realName: string; email: string; role: string; permissions: string[] }[]
> {
  const role = await getCallerRole();
  if (!isSuperAdmin(role)) return [];

  const supabase = await createClient();
  const { data: admins } = await supabase
    .from("profiles")
    .select("id, real_name, email, role")
    .eq("role", "admin")
    .order("real_name");

  if (!admins?.length) return [];

  const ids = admins.map((a: any) => a.id);
  const { data: perms } = await supabase
    .from("admin_permissions")
    .select("user_id, permission")
    .in("user_id", ids);

  const permMap = new Map<string, string[]>();
  for (const p of perms ?? []) {
    const list = permMap.get(p.user_id) ?? [];
    list.push(p.permission);
    permMap.set(p.user_id, list);
  }

  return admins.map((a: any) => ({
    id: a.id,
    realName: a.real_name,
    email: a.email,
    role: a.role,
    permissions: permMap.get(a.id) ?? [],
  }));
}

export async function promoteToAdmin(userId: string): Promise<ActionResult> {
  const role = await getCallerRole();
  if (!isSuperAdmin(role)) return { error: "권한이 없습니다" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId)
    .eq("role", "user");

  if (error) return { error: error.message };
  revalidatePath("/admin/roles");
  return { success: true };
}

export async function demoteFromAdmin(userId: string): Promise<ActionResult> {
  const role = await getCallerRole();
  if (!isSuperAdmin(role)) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  await supabase.from("admin_permissions").delete().eq("user_id", userId);

  const { error } = await supabase
    .from("profiles")
    .update({ role: "user" })
    .eq("id", userId)
    .eq("role", "admin");

  if (error) return { error: error.message };
  revalidatePath("/admin/roles");
  return { success: true };
}

// ─── Admin Settings ─────────────────────────────────────────

export async function getAdminSettings(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("admin_settings").select("key, value");
  const settings: Record<string, string> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function getMenuSelectionCutoff(): Promise<{ day: number; time: string }> {
  const settings = await getAdminSettings();
  return {
    day: parseInt(settings.menu_selection_cutoff_day ?? "4", 10),
    time: settings.menu_selection_cutoff_time ?? "23:59",
  };
}

export async function updateAdminSetting(
  key: string,
  value: string
): Promise<ActionResult> {
  if (!(await hasPermission("settings"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { success: true };
}

export async function approveUser(
  userId: string,
  password: string
): Promise<ActionResult> {
  if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
    return { error: "Password must be exactly 4 digits" };
  }

  if (!(await hasPermission("users.approve"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  const { error } = await supabase.rpc("approve_user", {
    target_user_id: userId,
    new_password: password,
  });

  if (error) {
    console.error("[approveUser] Error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function resetUserPassword(
  userId: string,
  password: string
): Promise<ActionResult> {
  if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
    return { error: "비밀번호는 4자리 숫자여야 합니다" };
  }

  if (!(await hasPermission("users.reset_password"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_user_password", {
    target_user_id: userId,
    new_password: password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function disableUser(userId: string): Promise<ActionResult> {
  if (!(await hasPermission("users.disable"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ status: "disabled" })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function enableUser(userId: string): Promise<ActionResult> {
  if (!(await hasPermission("users.disable"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ status: "approved" })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  if (!(await hasPermission("users.delete"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .single();

  if (target?.status !== "disabled") {
    return { error: "비활성화된 사용자만 삭제할 수 있습니다" };
  }

  const adminSupabase = createAdminClient();

  const { error: profileError } = await adminSupabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: authError } = await adminSupabase.auth.admin.deleteUser(userId);

  if (authError) {
    return { error: authError.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getAllUsers() {
  if (!(await hasPermission("users.view"))) return [];

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return users ?? [];
}

export async function getAllowedDomains() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("allowed_domains")
    .select("*")
    .order("domain");

  return data ?? [];
}

export async function addAllowedDomain(domain: string): Promise<ActionResult> {
  const supabase = await createClient();

  const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
  if (!cleaned || !cleaned.includes(".")) {
    return { error: "Invalid domain format" };
  }

  const { error } = await supabase
    .from("allowed_domains")
    .insert({ domain: cleaned });

  if (error) {
    if (error.code === "23505") {
      return { error: "Domain already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function removeAllowedDomain(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("allowed_domains")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Dashboard Analytics ─────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  approvedUsers: number;
  activeSubscribers: number;
  paidSubscribers: number;
  totalPickups: number;
  totalDeliveries: number;
  pickupRate: number;
  menuPopularity: { menuId: string; menuTitle: string; count: number }[];
  dailyDeliveries: { date: string; count: number }[];
}

export async function getDashboardStats(
  periodId?: string
): Promise<DashboardStats> {
  if (!(await hasPermission("dashboard"))) {
    return {
      totalUsers: 0, approvedUsers: 0, activeSubscribers: 0,
      paidSubscribers: 0, totalPickups: 0, totalDeliveries: 0,
      pickupRate: 0, menuPopularity: [], dailyDeliveries: [],
    };
  }

  const supabase = await createClient();

  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  const { count: approvedUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");

  let subsQuery = supabase.from("subscriptions").select("*", { count: "exact", head: true });
  let paidQuery = supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("payment_status", "completed");

  if (periodId) {
    subsQuery = subsQuery.eq("period_id", periodId);
    paidQuery = paidQuery.eq("period_id", periodId);
  }

  const { count: activeSubscribers } = await subsQuery;
  const { count: paidSubscribers } = await paidQuery;

  const { count: totalPickups } = await supabase
    .from("pickups")
    .select("*", { count: "exact", head: true })
    .eq("confirmed", true);

  const { data: disabledProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "disabled");
  const disabledUserIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

  const { data: selections } = await supabase
    .from("user_menu_selections")
    .select("delivery_date, user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))");

  const activeSelections = (selections ?? []).filter(
    (s: any) => !disabledUserIds.has(s.user_id)
  );
  const totalDeliveries = activeSelections.reduce(
    (sum: number, s: any) => sum + ((s.quantity as number) ?? 1),
    0
  );
  const pickupRate = totalDeliveries > 0
    ? Math.round(((totalPickups ?? 0) / totalDeliveries) * 100)
    : 0;

  const menuCountMap = new Map<string, { menuId: string; menuTitle: string; count: number }>();
  const dailyCountMap = new Map<string, number>();

  for (const sel of activeSelections) {
    const qty = (sel as any).quantity ?? 1;
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (menu) {
      const existing = menuCountMap.get(menu.id);
      if (existing) {
        existing.count += qty;
      } else {
        menuCountMap.set(menu.id, { menuId: menu.id, menuTitle: menu.title, count: qty });
      }
    }
    const d = sel.delivery_date;
    dailyCountMap.set(d, (dailyCountMap.get(d) ?? 0) + qty);
  }

  const menuPopularity = Array.from(menuCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const dailyDeliveries = Array.from(dailyCountMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return {
    totalUsers: totalUsers ?? 0,
    approvedUsers: approvedUsers ?? 0,
    activeSubscribers: activeSubscribers ?? 0,
    paidSubscribers: paidSubscribers ?? 0,
    totalPickups: totalPickups ?? 0,
    totalDeliveries,
    pickupRate,
    menuPopularity,
    dailyDeliveries,
  };
}

// ─── Vendor Report ───────────────────────────────────────────

export interface VendorReportRow {
  date: string;
  totalSalads: number;
  menuBreakdown: {
    menuTitle: string;
    count: number;
    pickers: { name: string; count: number }[];
  }[];
}

export async function getVendorReport(
  startDate: string,
  endDate: string
): Promise<VendorReportRow[]> {
  if (!(await hasPermission("vendor_report"))) return [];

  const supabase = await createClient();

  const { data: disabledProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "disabled");
  const disabledUserIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

  // Include week rows that start just before the range so Mon–Fri dates inside the range are not dropped.
  const weekStartLower = formatDateISO(
    new Date(new Date(startDate + "T00:00:00").getTime() - 7 * 86400000)
  );

  const [selectionsResult, deliveryDaysResult, assignmentsResult] = await Promise.all([
    supabase
      .from("user_menu_selections")
      .select(
        "delivery_date, user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))"
      )
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate)
      .order("delivery_date"),
    supabase
      .from("delivery_days")
      .select("user_id, week_start, selected_days, subscription_id")
      .gte("week_start", weekStartLower)
      .lte("week_start", endDate),
    supabase
      .from("daily_menu_assignments")
      .select("id, delivery_date, menu_id, slot_type, menu:menus(id, title)")
      .eq("slot_type", "main")
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate),
  ]);

  // Fetch real names for any users appearing in selections, so we can show
  // "who picked which menu" compactly in the report.
  const userIds = [
    ...new Set(
      (selectionsResult.data ?? [])
        .map((s: any) => s.user_id)
        .filter(Boolean)
    ),
  ] as string[];
  const nameByUserId = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, real_name, nickname, email")
      .in("id", userIds);
    for (const p of (profilesData ?? []) as any[]) {
      nameByUserId.set(
        p.id,
        p.real_name || p.nickname || p.email?.split("@")[0] || "알수없음"
      );
    }
  }

  const activeSelections = (selectionsResult.data ?? []).filter(
    (s: any) => !disabledUserIds.has(s.user_id)
  );

  const subIds = [
    ...new Set(
      (deliveryDaysResult.data ?? [])
        .map((dd: any) => dd.subscription_id)
        .filter(Boolean)
    ),
  ] as string[];

  type SubRow = {
    id: string;
    salads_per_delivery: number | null;
    subscription_periods: {
      target_month: string;
      delivery_start: string | null;
      delivery_end: string | null;
    } | null;
  };

  const subById = new Map<string, SubRow>();
  if (subIds.length > 0) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select(
        "id, salads_per_delivery, subscription_periods(target_month, delivery_start, delivery_end)"
      )
      .in("id", subIds);
    for (const s of (subs ?? []) as SubRow[]) {
      subById.set(s.id, s);
    }
  }

  function targetMonthLabelFromDateStr(dateStr: string): string {
    const [y, m] = dateStr.split("-").map(Number);
    return `${y}년 ${m}월`;
  }

  function deliveryDayCountsForVendorReport(
    dateStr: string,
    sub: SubRow | undefined
  ): number | null {
    if (!sub?.subscription_periods) return null;
    const p = sub.subscription_periods;
    if (!p.delivery_start || !p.delivery_end) return null;
    const ds = p.delivery_start.slice(0, 10);
    const de = p.delivery_end.slice(0, 10);
    if (dateStr < ds || dateStr > de) return null;
    if (p.target_month !== targetMonthLabelFromDateStr(dateStr)) return null;
    return sub.salads_per_delivery ?? 1;
  }

  // Same scope as home 구독 현황: only subscriptions whose period.target_month matches the calendar month of that day.
  const saladsSubscribedPerDate = new Map<string, number>();
  const usersCountedPerDate = new Map<string, Set<string>>();

  for (const dd of deliveryDaysResult.data ?? []) {
    if (disabledUserIds.has(dd.user_id)) continue;
    const sub = subById.get(dd.subscription_id);
    const weekStart = new Date(dd.week_start + "T00:00:00");
    for (const dayNum of dd.selected_days ?? []) {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + (dayNum - 1));
      const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
      if (dateStr < startDate || dateStr > endDate) continue;
      const saladsPerDelivery = deliveryDayCountsForVendorReport(dateStr, sub);
      if (saladsPerDelivery == null) continue;
      saladsSubscribedPerDate.set(
        dateStr,
        (saladsSubscribedPerDate.get(dateStr) ?? 0) + saladsPerDelivery
      );
      if (!usersCountedPerDate.has(dateStr)) usersCountedPerDate.set(dateStr, new Set());
      usersCountedPerDate.get(dateStr)!.add(dd.user_id);
    }
  }

  const activeSelectionsForReport = activeSelections.filter((s: any) =>
    usersCountedPerDate.get(s.delivery_date)?.has(s.user_id)
  );

  type MenuAggregate = {
    menuTitle: string;
    count: number;
    pickerCounts: Map<string, number>;
  };
  const dateMap = new Map<string, Map<string, MenuAggregate>>();

  for (const sel of activeSelectionsForReport) {
    const date = sel.delivery_date;
    const qty = (sel as any).quantity ?? 1;
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (!menu) continue;

    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const menuMap = dateMap.get(date)!;

    const existing = menuMap.get(menu.id);
    if (existing) {
      existing.count += qty;
      existing.pickerCounts.set(
        sel.user_id,
        (existing.pickerCounts.get(sel.user_id) ?? 0) + qty
      );
    } else {
      const pickerCounts = new Map<string, number>();
      pickerCounts.set(sel.user_id, qty);
      menuMap.set(menu.id, {
        menuTitle: menu.title,
        count: qty,
        pickerCounts,
      });
    }
  }

  const mainMenusPerDate = new Map<string, { id: string; title: string }[]>();
  for (const a of assignmentsResult.data ?? []) {
    const menu = (a as any).menu;
    if (!menu) continue;
    const date = a.delivery_date;
    if (!mainMenusPerDate.has(date)) mainMenusPerDate.set(date, []);
    mainMenusPerDate.get(date)!.push({ id: menu.id, title: menu.title });
  }

  const selectedSaladsPerDate = new Map<string, number>();
  for (const sel of activeSelectionsForReport) {
    const date = sel.delivery_date;
    const qty = (sel as any).quantity ?? 1;
    selectedSaladsPerDate.set(date, (selectedSaladsPerDate.get(date) ?? 0) + qty);
  }

  const allDates = new Set([
    ...dateMap.keys(),
    ...saladsSubscribedPerDate.keys(),
  ]);

  const result: VendorReportRow[] = [];
  for (const date of allDates) {
    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const menuMap = dateMap.get(date)!;

    const totalSubscribed = saladsSubscribedPerDate.get(date) ?? 0;
    const totalSelected = selectedSaladsPerDate.get(date) ?? 0;
    const unselectedSalads = Math.max(0, totalSubscribed - totalSelected);

    if (unselectedSalads > 0) {
      const mainMenus = mainMenusPerDate.get(date) ?? [];
      if (mainMenus.length > 0) {
        const perMenu = Math.floor(unselectedSalads / mainMenus.length);
        let remainder = unselectedSalads % mainMenus.length;

        for (const mm of mainMenus) {
          const extra = remainder > 0 ? 1 : 0;
          remainder--;
          const addCount = perMenu + extra;
          if (addCount === 0) continue;

          const existing = menuMap.get(mm.id);
          if (existing) {
            existing.count += addCount;
          } else {
            menuMap.set(mm.id, {
              menuTitle: mm.title,
              count: addCount,
              pickerCounts: new Map(),
            });
          }
        }
      }
    }

    const menuBreakdown = Array.from(menuMap.values())
      .map((m) => ({
        menuTitle: m.menuTitle,
        count: m.count,
        pickers: Array.from(m.pickerCounts.entries())
          .map(([uid, cnt]) => ({
            name: nameByUserId.get(uid) ?? "알수없음",
            count: cnt,
          }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.count - a.count);
    if (menuBreakdown.length === 0) continue;

    result.push({
      date,
      totalSalads: menuBreakdown.reduce((sum, m) => sum + m.count, 0),
      menuBreakdown,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Community Moderation ────────────────────────────────────

export async function getAdminPosts(
  limit = 50,
  offset = 0
): Promise<{ posts: any[]; total: number }> {
  if (!(await hasPermission("community"))) return { posts: [], total: 0 };

  const supabase = await createClient();

  const { count } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true });

  const { data } = await supabase
    .from("posts")
    .select("*, profile:profiles(nickname, email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return { posts: data ?? [], total: count ?? 0 };
}

export async function getAdminComments(
  postId: string
): Promise<any[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("comments")
    .select("*, profile:profiles(nickname, email)")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function adminDeletePost(postId: string): Promise<ActionResult> {
  if (!(await hasPermission("community"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { success: true };
}

export async function adminDeleteComment(commentId: string): Promise<ActionResult> {
  if (!(await hasPermission("community"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();

  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  return { success: true };
}

// ─── Delivery Summary ────────────────────────────────────────

export interface DailySummaryItem {
  date: string;
  totalSalads: number;
  menuBreakdown: {
    menuId: string;
    menuTitle: string;
    menuImage: string | null;
    count: number;
  }[];
}

export async function getDeliverySummary(
  startDate: string,
  endDate: string
): Promise<DailySummaryItem[]> {
  const supabase = await createClient();

  const { data: disabledProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "disabled");
  const disabledUserIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

  const { data: selections } = await supabase
    .from("user_menu_selections")
    .select(
      "delivery_date, user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title, image_url))"
    )
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  const activeSelections = (selections ?? []).filter(
    (s: any) => !disabledUserIds.has(s.user_id)
  );
  if (activeSelections.length === 0) return [];

  const dateMap = new Map<
    string,
    Map<string, { menuId: string; menuTitle: string; menuImage: string | null; count: number }>
  >();

  for (const sel of activeSelections) {
    const date = sel.delivery_date;
    const qty = (sel as any).quantity ?? 1;
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (!menu) continue;

    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const menuMap = dateMap.get(date)!;

    const existing = menuMap.get(menu.id);
    if (existing) {
      existing.count += qty;
    } else {
      menuMap.set(menu.id, {
        menuId: menu.id,
        menuTitle: menu.title,
        menuImage: menu.image_url,
        count: qty,
      });
    }
  }

  const result: DailySummaryItem[] = [];
  for (const [date, menuMap] of dateMap) {
    const menuBreakdown = Array.from(menuMap.values()).sort(
      (a, b) => b.count - a.count
    );
    result.push({
      date,
      totalSalads: menuBreakdown.reduce((sum, m) => sum + m.count, 0),
      menuBreakdown,
    });
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Subscription Day Counts (Admin) ─────────────────────────

export async function getSubscriptionDayCounts(
  periodId: string
): Promise<Record<string, number>> {
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, salads_per_delivery")
    .eq("period_id", periodId);

  if (!subscriptions?.length) return {};

  const subIds = subscriptions.map((s: any) => s.id);
  const saladsMap = new Map<string, number>();
  for (const s of subscriptions) {
    saladsMap.set(s.id, s.salads_per_delivery ?? 1);
  }

  const [{ data: disabledProfiles }, { data: deliveryDays }] = await Promise.all([
    supabase.from("profiles").select("id").eq("status", "disabled"),
    supabase.from("delivery_days").select("subscription_id, week_start, selected_days, user_id").in("subscription_id", subIds),
  ]);

  if (!deliveryDays?.length) return {};

  const disabledUserIds = new Set(
    (disabledProfiles ?? []).map((p: any) => p.id)
  );

  const dateCounts: Record<string, number> = {};
  for (const dd of deliveryDays) {
    if (disabledUserIds.has(dd.user_id)) continue;
    const saladsPerDelivery = saladsMap.get(dd.subscription_id) ?? 1;
    for (const day of dd.selected_days) {
      const date = new Date(dd.week_start + "T00:00:00");
      date.setDate(date.getDate() + day - 1);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      dateCounts[dateStr] = (dateCounts[dateStr] || 0) + saladsPerDelivery;
    }
  }

  return dateCounts;
}

export async function getSubscribersForDate(
  periodId: string,
  targetDate: string
): Promise<{ userId: string; realName: string; saladsPerDelivery: number }[]> {
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, user_id, salads_per_delivery")
    .eq("period_id", periodId);

  if (!subscriptions?.length) return [];

  const { data: disabledProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "disabled");
  const disabledUserIds = new Set(
    (disabledProfiles ?? []).map((p: any) => p.id)
  );

  const subIds = subscriptions.map((s: any) => s.id);
  const userSaladsMap = new Map(
    subscriptions.map((s: any) => [s.user_id, s.salads_per_delivery as number])
  );

  const { data: deliveryDays } = await supabase
    .from("delivery_days")
    .select("subscription_id, user_id, week_start, selected_days")
    .in("subscription_id", subIds);

  if (!deliveryDays?.length) return [];

  const matchedUserIds: string[] = [];
  for (const dd of deliveryDays) {
    if (disabledUserIds.has(dd.user_id)) continue;
    for (const day of dd.selected_days) {
      const date = new Date(dd.week_start + "T00:00:00");
      date.setDate(date.getDate() + day - 1);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      if (`${y}-${m}-${d}` === targetDate) {
        matchedUserIds.push(dd.user_id);
      }
    }
  }

  if (matchedUserIds.length === 0) return [];

  const uniqueIds = [...new Set(matchedUserIds)];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, real_name")
    .in("id", uniqueIds);

  return (profiles ?? []).map((p: any) => ({
    userId: p.id,
    realName: p.real_name || "이름 없음",
    saladsPerDelivery: userSaladsMap.get(p.id) ?? 1,
  }));
}

// ─── Company Users (same email domain) ──────────────────────

export async function getCompanyUsers(): Promise<
  { id: string; realName: string }[]
> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user?.email) return [];

  const domain = user.email.split("@")[1];
  if (!domain) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, real_name, email")
    .eq("status", "approved")
    .ilike("email", `%@${domain}`)
    .order("real_name");

  return (data ?? []).map((p: any) => ({
    id: p.id,
    realName: p.real_name || "이름 없음",
  }));
}

// ─── Daily Salad Status ─────────────────────────────────────

export async function getDailySaladStatus(
  date: string
): Promise<DailySaladStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_salad_status")
    .select("*")
    .eq("status_date", date)
    .single();
  return (data as DailySaladStatus) ?? null;
}

export async function getDailySaladStatusHistory(
  startDate: string,
  endDate: string
): Promise<DailySaladStatus[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_salad_status")
    .select("*")
    .gte("status_date", startDate)
    .lte("status_date", endDate)
    .order("status_date", { ascending: false });
  return (data as DailySaladStatus[]) ?? [];
}

export async function updateDailySaladStatus(
  date: string,
  isChecked: boolean,
  location?: string,
  photoUrl?: string,
  helpers?: string
): Promise<ActionResult> {
  const role = await getCallerRole();
  if (!role || !ADMIN_ROLES.includes(role)) return { error: "권한이 없습니다" };

  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_salad_status")
    .upsert(
      {
        status_date: date,
        is_checked: isChecked,
        location: location || null,
        photo_url: photoUrl || null,
        checked_by: user.id,
        helpers: helpers || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "status_date" }
    );

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/admin/today");
  return { success: true };
}

export async function getTodaySaladSummary(): Promise<
  { menuTitle: string; count: number }[]
> {
  const role = await getCallerRole();
  if (!role || !ADMIN_ROLES.includes(role)) return [];

  const todayStr = formatDateISO(getKSTDate());

  const supabase = await createClient();

  const [disabledResult, selectionsResult, deliveryDaysResult, assignmentsResult] =
    await Promise.all([
      supabase.from("profiles").select("id").eq("status", "disabled"),
      supabase
        .from("user_menu_selections")
        .select(
          "delivery_date, user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))"
        )
        .eq("delivery_date", todayStr),
      supabase
        .from("delivery_days")
        .select("user_id, week_start, selected_days"),
      supabase
        .from("daily_menu_assignments")
        .select("id, delivery_date, menu_id, slot_type, menu:menus(id, title)")
        .eq("slot_type", "main")
        .eq("delivery_date", todayStr),
    ]);

  const disabledUserIds = new Set(
    (disabledResult.data ?? []).map((p: any) => p.id)
  );

  const activeSelections = (selectionsResult.data ?? []).filter(
    (s: any) => !disabledUserIds.has(s.user_id)
  );

  const menuMap = new Map<string, { menuTitle: string; count: number }>();
  for (const sel of activeSelections) {
    const qty = (sel as any).quantity ?? 1;
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (!menu) continue;
    const existing = menuMap.get(menu.id);
    if (existing) {
      existing.count += qty;
    } else {
      menuMap.set(menu.id, { menuTitle: menu.title, count: qty });
    }
  }

  const subscribersToday = new Set<string>();
  for (const dd of deliveryDaysResult.data ?? []) {
    if (disabledUserIds.has(dd.user_id)) continue;
    const weekStart = new Date(dd.week_start + "T00:00:00");
    for (const dayNum of dd.selected_days) {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + (dayNum - 1));
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      if (`${y}-${m}-${d}` === todayStr) {
        subscribersToday.add(dd.user_id);
      }
    }
  }

  const selectedUsersToday = new Set(activeSelections.map((s: any) => s.user_id));
  const unselectedCount = Math.max(0, subscribersToday.size - selectedUsersToday.size);

  if (unselectedCount > 0) {
    const mainMenus = (assignmentsResult.data ?? [])
      .map((a: any) => ({ id: a.menu?.id, title: a.menu?.title }))
      .filter((m: any) => m.id);
    if (mainMenus.length > 0) {
      const perMenu = Math.floor(unselectedCount / mainMenus.length);
      let remainder = unselectedCount % mainMenus.length;
      for (const mm of mainMenus) {
        const extra = remainder > 0 ? 1 : 0;
        remainder--;
        const addCount = perMenu + extra;
        if (addCount === 0) continue;
        const existing = menuMap.get(mm.id);
        if (existing) {
          existing.count += addCount;
        } else {
          menuMap.set(mm.id, { menuTitle: mm.title, count: addCount });
        }
      }
    }
  }

  return Array.from(menuMap.values()).sort((a, b) => b.count - a.count);
}
