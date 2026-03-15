"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return { error: "권한이 없습니다" };
  }

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

  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return { error: "권한이 없습니다" };
  }

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return { error: "Unauthorized" };
  }

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return { error: "권한이 없습니다" };
  }

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return { error: "권한이 없습니다" };
  }

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return [];
  }

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return {
      totalUsers: 0, approvedUsers: 0, activeSubscribers: 0,
      paidSubscribers: 0, totalPickups: 0, totalDeliveries: 0,
      pickupRate: 0, menuPopularity: [], dailyDeliveries: [],
    };
  }

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
  menuBreakdown: { menuTitle: string; count: number }[];
}

export async function getVendorReport(
  startDate: string,
  endDate: string
): Promise<VendorReportRow[]> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return [];

  const { data: disabledProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "disabled");
  const disabledUserIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

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
      .select("user_id, week_start, selected_days")
      .gte("week_start", startDate)
      .lte("week_start", endDate),
    supabase
      .from("daily_menu_assignments")
      .select("id, delivery_date, menu_id, slot_type, menu:menus(id, title)")
      .eq("slot_type", "main")
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate),
  ]);

  const activeSelections = (selectionsResult.data ?? []).filter(
    (s: any) => !disabledUserIds.has(s.user_id)
  );

  const dateMap = new Map<string, Map<string, { menuTitle: string; count: number }>>();

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
      menuMap.set(menu.id, { menuTitle: menu.title, count: qty });
    }
  }

  const subscribersPerDate = new Map<string, Set<string>>();
  for (const dd of deliveryDaysResult.data ?? []) {
    if (disabledUserIds.has(dd.user_id)) continue;
    const weekStart = new Date(dd.week_start + "T00:00:00");
    for (const dayNum of dd.selected_days) {
      const dateObj = new Date(weekStart);
      dateObj.setDate(weekStart.getDate() + (dayNum - 1));
      const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
      if (dateStr < startDate || dateStr > endDate) continue;
      if (!subscribersPerDate.has(dateStr)) subscribersPerDate.set(dateStr, new Set());
      subscribersPerDate.get(dateStr)!.add(dd.user_id);
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

  const selectedUsersPerDate = new Map<string, Set<string>>();
  for (const sel of activeSelections) {
    const date = sel.delivery_date;
    if (!selectedUsersPerDate.has(date)) selectedUsersPerDate.set(date, new Set());
    selectedUsersPerDate.get(date)!.add(sel.user_id);
  }

  const allDates = new Set([
    ...dateMap.keys(),
    ...subscribersPerDate.keys(),
  ]);

  const result: VendorReportRow[] = [];
  for (const date of allDates) {
    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const menuMap = dateMap.get(date)!;

    const totalSubscribers = subscribersPerDate.get(date)?.size ?? 0;
    const selectedCount = selectedUsersPerDate.get(date)?.size ?? 0;
    const unselectedCount = Math.max(0, totalSubscribers - selectedCount);

    if (unselectedCount > 0) {
      const mainMenus = mainMenusPerDate.get(date) ?? [];
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

    const menuBreakdown = Array.from(menuMap.values()).sort((a, b) => b.count - a.count);
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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return { posts: [], total: 0 };

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
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return { error: "Unauthorized" };

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { success: true };
}

export async function adminDeleteComment(commentId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return { error: "Unauthorized" };

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
    .select("id")
    .eq("period_id", periodId);

  if (!subscriptions?.length) return {};

  const { data: disabledProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("status", "disabled");
  const disabledUserIds = new Set(
    (disabledProfiles ?? []).map((p: any) => p.id)
  );

  const subIds = subscriptions.map((s: any) => s.id);

  const { data: deliveryDays } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days, user_id")
    .in("subscription_id", subIds);

  if (!deliveryDays?.length) return {};

  const dateCounts: Record<string, number> = {};
  for (const dd of deliveryDays) {
    if (disabledUserIds.has(dd.user_id)) continue;
    for (const day of dd.selected_days) {
      const date = new Date(dd.week_start + "T00:00:00");
      date.setDate(date.getDate() + day - 1);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
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
