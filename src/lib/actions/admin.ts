"use server";

import { cache } from "react";
import {
  createClient,
  createAdminClient,
  createPublicClient,
  getAuthUser,
} from "@/lib/supabase/server";
import { revalidatePath, updateTag, unstable_cache } from "next/cache";
import type {
  ActionResult,
  DailySaladStatus,
  SubscriptionHoldDurationKind,
} from "@/types";
import { formatDateISO, getKSTDate } from "@/lib/utils";
import {
  buildSkippedDateKeySet,
  countSaladsPerDateFromDeliveryRows,
  expandActiveDeliveryDatesBySub,
  isDeliveryDateSkipped,
  userIdsForActiveDeliveryDate,
} from "@/lib/delivery-schedule";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getSubscriptionPeriodById } from "@/lib/actions/subscription";
import {
  getPaidDeliveryDaysForBilling,
  getSubscriptionPrice,
} from "@/lib/subscription-billing";

const ADMIN_ROLES = ["admin", "super_admin"];
const SUPER_ADMIN_ROLES = ["super_admin"];

function revalidateDeliveryScheduleViews(userId?: string): void {
  updateTag("day-counts");
  revalidatePath("/");
  revalidatePath("/my");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

// Reuses the request-cached profile row instead of issuing another
// `profiles` query per permission check.
const getCallerRoleCached = cache(async (): Promise<string | null> => {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
});

async function getCallerRole(): Promise<string | null> {
  return getCallerRoleCached();
}

function isAnyAdmin(role: string | null): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

function isSuperAdmin(role: string | null): boolean {
  return !!role && SUPER_ADMIN_ROLES.includes(role);
}

const hasPermissionCached = cache(async (permission: string): Promise<boolean> => {
  const profile = await getCurrentProfile();
  if (!profile) return false;

  if (profile.role === "super_admin") return true;
  if (profile.role !== "admin") return false;

  // Read admin_permissions via service role client. The `admin_permissions`
  // RLS policy only allows super_admin reads, which would otherwise prevent
  // a regular admin from seeing their own permissions. We scope by the
  // authenticated user's own id, so there is no data leak.
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_permissions")
    .select("id")
    .eq("user_id", profile.id)
    .eq("permission", permission)
    .limit(1);

  return (data?.length ?? 0) > 0;
});

async function hasPermission(permission: string): Promise<boolean> {
  return hasPermissionCached(permission);
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

const getMyPermissionsCached = cache(async (): Promise<string[]> => {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  if (profile.role === "super_admin") {
    return ALL_PERMISSIONS.map((p) => p.key);
  }
  if (profile.role !== "admin") return [];

  return getUserPermissions(profile.id);
});

export async function getMyPermissions(): Promise<string[]> {
  return getMyPermissionsCached();
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

const fetchMenuSelectionCutoffCached = unstable_cache(
  async (): Promise<{ day: number; time: string }> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("admin_settings")
      .select("key, value")
      .in("key", ["menu_selection_cutoff_day", "menu_selection_cutoff_time"]);

    const settings: Record<string, string> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    return {
      day: parseInt(settings.menu_selection_cutoff_day ?? "4", 10),
      time: settings.menu_selection_cutoff_time ?? "23:59",
    };
  },
  ["menu-selection-cutoff"],
  { revalidate: 600, tags: ["settings"] }
);

export const getMenuSelectionCutoff = cache(
  async (): Promise<{ day: number; time: string }> =>
    fetchMenuSelectionCutoffCached()
);

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

  updateTag("settings");
  revalidatePath("/admin");
  return { success: true };
}

export async function saveSubscriptionHoldAdminSettings(params: {
  masterEnabled: boolean;
  allowedDurationKinds: SubscriptionHoldDurationKind[];
}): Promise<ActionResult> {
  if (!(await hasPermission("settings"))) return { error: "권한이 없습니다" };

  if (params.allowedDurationKinds.length === 0) {
    return { error: "허용할 홀드 기간을 한 가지 이상 선택해 주세요" };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const rows = [
    {
      key: "subscription_hold_master_enabled",
      value: params.masterEnabled ? "true" : "false",
      updated_at: now,
    },
    {
      key: "subscription_hold_allowed_duration_kinds",
      value: JSON.stringify(params.allowedDurationKinds),
      updated_at: now,
    },
  ];

  for (const row of rows) {
    const { error } = await supabase
      .from("admin_settings")
      .upsert(row, { onConflict: "key" });
    if (error) return { error: error.message };
  }

  updateTag("settings");
  revalidatePath("/admin/settings");
  revalidatePath("/subscription");
  return { success: true };
}

export async function setUserSubscriptionHoldEligible(
  userId: string,
  eligible: boolean
): Promise<ActionResult> {
  const canSettings = await hasPermission("settings");
  const canSubStatus = await hasPermission("subscription_status");
  if (!canSettings && !canSubStatus) {
    return { error: "권한이 없습니다" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ subscription_hold_eligible: eligible })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/subscription");
  return { success: true };
}

export type WeeklyMenuDeadline = {
  id: string;
  week_start: string;
  deadline_at: string;
};

const fetchWeeklyMenuDeadlinesCached = unstable_cache(
  async (startDate: string, endDate: string): Promise<WeeklyMenuDeadline[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("menu_selection_deadlines")
      .select("id, week_start, deadline_at")
      .gte("week_start", startDate)
      .lte("week_start", endDate)
      .order("week_start");

    return (data as WeeklyMenuDeadline[]) ?? [];
  },
  ["weekly-menu-deadlines"],
  { revalidate: 600, tags: ["settings"] }
);

export async function getWeeklyMenuDeadlines(
  startDate: string,
  endDate: string
): Promise<WeeklyMenuDeadline[]> {
  return fetchWeeklyMenuDeadlinesCached(startDate, endDate);
}

export async function upsertWeeklyMenuDeadline(
  weekStart: string,
  deadlineDate: string,
  deadlineTime: string
): Promise<ActionResult> {
  if (!(await hasPermission("settings"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();
  const deadlineAt = `${deadlineDate}T${deadlineTime}:00+09:00`;
  const { error } = await supabase.from("menu_selection_deadlines").upsert(
    {
      week_start: weekStart,
      deadline_at: deadlineAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "week_start" }
  );

  if (error) return { error: error.message };

  updateTag("settings");
  revalidatePath("/menu");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/reports");
  return { success: true };
}

export async function deleteWeeklyMenuDeadline(id: string): Promise<ActionResult> {
  if (!(await hasPermission("settings"))) return { error: "권한이 없습니다" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_selection_deadlines")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  updateTag("settings");
  revalidatePath("/menu");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/reports");
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

  // Resolve the period first (served from the cached periods list) so the
  // selections scan below can be scoped to its delivery window.
  const period = periodId ? await getSubscriptionPeriodById(periodId) : null;

  let subsQuery = supabase.from("subscriptions").select("*", { count: "exact", head: true });
  let paidQuery = supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("payment_status", "completed");

  if (periodId) {
    subsQuery = subsQuery.eq("period_id", periodId);
    paidQuery = paidQuery.eq("period_id", periodId);
  }

  let selectionsQuery = supabase
    .from("user_menu_selections")
    .select("delivery_date, user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))");
  if (period?.delivery_start && period.delivery_end) {
    selectionsQuery = selectionsQuery
      .gte("delivery_date", period.delivery_start.slice(0, 10))
      .lte("delivery_date", period.delivery_end.slice(0, 10));
  }

  // All independent — one parallel wave instead of seven serial round-trips.
  const [
    { count: totalUsers },
    { count: approvedUsers },
    { count: activeSubscribers },
    { count: paidSubscribers },
    { count: totalPickups },
    { data: disabledProfiles },
    { data: selections },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved"),
    subsQuery,
    paidQuery,
    supabase
      .from("pickups")
      .select("*", { count: "exact", head: true })
      .eq("confirmed", true),
    supabase.from("profiles").select("id").eq("status", "disabled"),
    selectionsQuery,
  ]);

  const disabledUserIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

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

  // Future months should only expose deliveries for subscribers whose
  // payment has been marked completed — the vendor shouldn't receive an
  // order for someone who applied but hasn't paid yet. For the current
  // month (and past months) we keep the existing behavior, which matches
  // the home '구독 현황' count and so avoids reintroducing the kind of
  // mismatch we fixed earlier (e.g. April 2nd 17 vs 18).
  const todayStr = formatDateISO(getKSTDate());
  const isFutureMonth = startDate > todayStr;

  // Include week rows that start just before the range so Mon–Fri dates inside the range are not dropped.
  const weekStartLower = formatDateISO(
    new Date(new Date(startDate + "T00:00:00").getTime() - 7 * 86400000)
  );

  const [disabledResult, selectionsResult, deliveryDaysResult, assignmentsResult, skippedResult] =
    await Promise.all([
      supabase.from("profiles").select("id").eq("status", "disabled"),
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
      supabase
        .from("skipped_delivery_days")
        .select("subscription_id, delivery_date")
        .gte("delivery_date", startDate)
        .lte("delivery_date", endDate),
    ]);

  const disabledUserIds = new Set(
    (disabledResult.data ?? []).map((p: any) => p.id)
  );

  const userIds = [
    ...new Set(
      (selectionsResult.data ?? [])
        .map((s: any) => s.user_id)
        .filter(Boolean)
    ),
  ] as string[];

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
    payment_status: string | null;
    subscription_periods: {
      target_month: string;
      delivery_start: string | null;
      delivery_end: string | null;
    } | null;
  };

  // Both follow-ups only depend on wave-1 ids — run them together.
  const [{ data: profilesData }, { data: subs }] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, real_name, nickname, email")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    subIds.length > 0
      ? supabase
          .from("subscriptions")
          .select(
            "id, salads_per_delivery, payment_status, subscription_periods(target_month, delivery_start, delivery_end)"
          )
          .in("id", subIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Real names for users appearing in selections, so we can show
  // "who picked which menu" compactly in the report.
  const nameByUserId = new Map<string, string>();
  for (const p of (profilesData ?? []) as any[]) {
    nameByUserId.set(
      p.id,
      p.real_name || p.nickname || p.email?.split("@")[0] || "알수없음"
    );
  }

  const activeSelections = (selectionsResult.data ?? []).filter(
    (s: any) => !disabledUserIds.has(s.user_id)
  );

  const subById = new Map<string, SubRow>();
  for (const s of (subs ?? []) as unknown as SubRow[]) {
    subById.set(s.id, s);
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
    // For future months, only include confirmed (paid) subscriptions. For
    // the current/past months, include all (matches home '구독 현황').
    if (isFutureMonth && sub.payment_status !== "completed") return null;
    return sub.salads_per_delivery ?? 1;
  }

  const skippedKeys = buildSkippedDateKeySet(skippedResult.data ?? []);

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
      if (isDeliveryDateSkipped(dd.subscription_id, dateStr, skippedKeys)) continue;
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
      } else {
        // No main menus assigned for this date yet (common for upcoming
        // months the admin hasn't planned). Still emit the day with the
        // subscribed count under a "메뉴 미배정" placeholder so the vendor
        // can see expected deliveries. Once menus are assigned the
        // placeholder disappears and the real titles replace it.
        const placeholderKey = "__unassigned__";
        menuMap.set(placeholderKey, {
          menuTitle: "메뉴 미배정",
          count: unselectedSalads,
          pickerCounts: new Map(),
        });
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

  const [{ data: disabledProfiles }, { data: selections }] = await Promise.all([
    supabase.from("profiles").select("id").eq("status", "disabled"),
    supabase
      .from("user_menu_selections")
      .select(
        "delivery_date, user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title, image_url))"
      )
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate)
      .order("delivery_date"),
  ]);
  const disabledUserIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

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
  return fetchSubscriptionDayCountsCached(periodId);
}

// Aggregate counts across all users — same answer for everyone, so cache it.
// Short TTL self-heals after user selections; closures bust the tag directly.
const fetchSubscriptionDayCountsCached = unstable_cache(
  async (periodId: string): Promise<Record<string, number>> => {
    const supabase = createPublicClient();

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

    const [{ data: disabledProfiles }, { data: deliveryDays }, { data: skippedDays }] =
      await Promise.all([
      supabase.from("profiles").select("id").eq("status", "disabled"),
      supabase
        .from("delivery_days")
        .select("subscription_id, week_start, selected_days, user_id")
        .in("subscription_id", subIds),
      supabase
        .from("skipped_delivery_days")
        .select("subscription_id, delivery_date")
        .in("subscription_id", subIds),
    ]);

    if (!deliveryDays?.length) return {};

    const disabledUserIds = new Set<string>(
      (disabledProfiles ?? []).map((p: any) => p.id as string)
    );
    const skippedKeys = buildSkippedDateKeySet(skippedDays ?? []);

    return countSaladsPerDateFromDeliveryRows(
      deliveryDays as any,
      skippedKeys,
      saladsMap,
      disabledUserIds
    );
  },
  ["subscription-day-counts"],
  { revalidate: 60, tags: ["day-counts"] }
);

export async function getSubscribersForDate(
  periodId: string,
  targetDate: string
): Promise<{ userId: string; realName: string; saladsPerDelivery: number }[]> {
  const supabase = await createClient();

  // Wave 1 — subscriptions and disabled profiles are independent.
  const [{ data: subscriptions }, { data: disabledProfiles }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("id, user_id, salads_per_delivery")
        .eq("period_id", periodId),
      supabase.from("profiles").select("id").eq("status", "disabled"),
    ]);

  if (!subscriptions?.length) return [];

  const disabledUserIds = new Set<string>(
    (disabledProfiles ?? []).map((p: any) => p.id as string)
  );

  const subIds = subscriptions.map((s: any) => s.id);
  const periodUserIds = [
    ...new Set(subscriptions.map((s: any) => s.user_id as string)),
  ];
  const userSaladsMap = new Map(
    subscriptions.map((s: any) => [s.user_id, s.salads_per_delivery as number])
  );

  // Wave 2 — fetch delivery days and names for all period users together,
  // then narrow to the users actually scheduled for the target date in JS.
  const [{ data: deliveryDays }, { data: profiles }, { data: skippedDays }] =
    await Promise.all([
    supabase
      .from("delivery_days")
      .select("subscription_id, user_id, week_start, selected_days")
      .in("subscription_id", subIds),
    supabase.from("profiles").select("id, real_name").in("id", periodUserIds),
    supabase
      .from("skipped_delivery_days")
      .select("subscription_id, delivery_date")
      .in("subscription_id", subIds),
  ]);

  if (!deliveryDays?.length) return [];

  const skippedKeys = buildSkippedDateKeySet(skippedDays ?? []);
  const matchedUserIds = userIdsForActiveDeliveryDate(
    deliveryDays as any,
    skippedKeys,
    targetDate,
    disabledUserIds
  );

  if (matchedUserIds.size === 0) return [];

  return (profiles ?? [])
    .filter((p: any) => matchedUserIds.has(p.id))
    .map((p: any) => ({
      userId: p.id,
      realName: p.real_name || "이름 없음",
      saladsPerDelivery: userSaladsMap.get(p.id) ?? 1,
    }));
}

// ─── Date Delivery Details (inline drill-down for admin status page) ────

export type DateDeliveryDetails = {
  subscribers: { userId: string; realName: string; saladsPerDelivery: number }[];
  menuBreakdown: {
    menuTitle: string;
    count: number;
    pickers: { name: string; count: number }[];
  }[];
};

/**
 * For a given subscription period and delivery date, returns:
 *   - the list of users scheduled for delivery that day, and
 *   - a vendor-report-style menu breakdown (per menu: count and who picked it)
 *
 * The scope matches the home "구독 현황" calendar counts (includes all
 * subscribers regardless of payment status), so the returned subscriber
 * list and menu totals are consistent with the per-day tile counts.
 *
 * Gated on super_admin, the `subscription_status` permission, or the
 * `vendor_report` permission — any of those roles already has legitimate
 * reasons to see this detail view.
 */
export async function getDateDeliveryDetails(
  periodId: string,
  date: string
): Promise<DateDeliveryDetails> {
  const empty: DateDeliveryDetails = { subscribers: [], menuBreakdown: [] };
  if (!periodId || !date) return empty;

  const role = await getCallerRole();
  if (!isAnyAdmin(role)) return empty;
  if (!isSuperAdmin(role)) {
    const [hasSub, hasVend] = await Promise.all([
      hasPermission("subscription_status"),
      hasPermission("vendor_report"),
    ]);
    if (!hasSub && !hasVend) return empty;
  }

  const admin = createAdminClient();

  // Wave 1 — period subscriptions, disabled profiles, and the day's main
  // menu assignments are mutually independent.
  const [{ data: subs }, { data: disabled }, assignmentsResult] =
    await Promise.all([
      admin
        .from("subscriptions")
        .select("id, user_id, salads_per_delivery")
        .eq("period_id", periodId),
      admin.from("profiles").select("id").eq("status", "disabled"),
      admin
        .from("daily_menu_assignments")
        .select("menu_id, slot_type, menu:menus(id, title)")
        .eq("slot_type", "main")
        .eq("delivery_date", date),
    ]);
  if (!subs?.length) return empty;

  const subIds = subs.map((s: any) => s.id as string);
  const periodUserIds = [
    ...new Set(subs.map((s: any) => s.user_id as string)),
  ];
  const userSaladsMap = new Map<string, number>();
  for (const s of subs as any[]) {
    userSaladsMap.set(s.user_id as string, (s.salads_per_delivery as number | null) ?? 1);
  }

  const disabledIds = new Set((disabled ?? []).map((p: any) => p.id as string));

  // Wave 2 — everything keyed on the period's subscription/user ids. The
  // selections and profiles are fetched for all period users and narrowed
  // to the exact date's roster in JS, which keeps this a single wave.
  const [{ data: deliveryRows }, selectionsResult, { data: profiles }, { data: skippedRows }] =
    await Promise.all([
      admin
        .from("delivery_days")
        .select("subscription_id, user_id, week_start, selected_days")
        .in("subscription_id", subIds),
      admin
        .from("user_menu_selections")
        .select(
          "user_id, quantity, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))"
        )
        .eq("delivery_date", date)
        .in("user_id", periodUserIds),
      admin
        .from("profiles")
        .select("id, real_name, nickname, email")
        .in("id", periodUserIds),
      admin
        .from("skipped_delivery_days")
        .select("subscription_id, delivery_date")
        .in("subscription_id", subIds),
    ]);

  const skippedKeys = buildSkippedDateKeySet(skippedRows ?? []);
  const usersForDate = userIdsForActiveDeliveryDate(
    (deliveryRows ?? []) as any,
    skippedKeys,
    date,
    disabledIds
  );

  if (usersForDate.size === 0) return empty;

  const userIds = [...usersForDate];

  const nameByUserId = new Map<string, string>();
  for (const p of (profiles ?? []) as any[]) {
    nameByUserId.set(
      p.id,
      p.real_name || p.nickname || p.email?.split("@")[0] || "알수없음"
    );
  }

  const subscribers = userIds
    .map((uid) => ({
      userId: uid,
      realName: nameByUserId.get(uid) ?? "이름 없음",
      saladsPerDelivery: userSaladsMap.get(uid) ?? 1,
    }))
    .sort((a, b) => a.realName.localeCompare(b.realName, "ko"));

  type MenuAggregate = {
    menuTitle: string;
    count: number;
    pickerCounts: Map<string, number>;
  };
  const menuMap = new Map<string, MenuAggregate>();

  let selectedSalads = 0;
  for (const sel of (selectionsResult.data ?? []) as any[]) {
    // Selections were fetched for all period users in one wave; narrow to
    // the users actually scheduled for this date.
    if (!usersForDate.has(sel.user_id as string)) continue;
    const qty = (sel.quantity as number | null) ?? 1;
    const menu = sel.daily_menu_assignment?.menu;
    if (!menu) continue;
    selectedSalads += qty;

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

  // Distribute salads from users who haven't picked a menu yet across the
  // admin-planned main menus. This mirrors the vendor-report logic so the
  // admin sees consistent numbers between both pages. If no main menus
  // have been planned, surface the total under a "메뉴 미배정" placeholder.
  const totalSubscribed = subscribers.reduce(
    (sum, s) => sum + s.saladsPerDelivery,
    0
  );
  const unselected = Math.max(0, totalSubscribed - selectedSalads);

  if (unselected > 0) {
    const mainMenus = ((assignmentsResult.data ?? []) as any[])
      .map((a) => a.menu as { id: string; title: string } | null)
      .filter((m): m is { id: string; title: string } => !!m);

    if (mainMenus.length > 0) {
      const perMenu = Math.floor(unselected / mainMenus.length);
      let remainder = unselected % mainMenus.length;
      for (const m of mainMenus) {
        const extra = remainder > 0 ? 1 : 0;
        remainder--;
        const add = perMenu + extra;
        if (add === 0) continue;
        const existing = menuMap.get(m.id);
        if (existing) existing.count += add;
        else
          menuMap.set(m.id, {
            menuTitle: m.title,
            count: add,
            pickerCounts: new Map(),
          });
      }
    } else {
      menuMap.set("__unassigned__", {
        menuTitle: "메뉴 미배정",
        count: unselected,
        pickerCounts: new Map(),
      });
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

  return { subscribers, menuBreakdown };
}

// ─── Period Subscribers types (used by status bundle + roster action) ───

export type PeriodSubscriber = {
  subscriptionId: string;
  userId: string;
  realName: string;
  frequencyPerWeek: number;
  saladsPerDelivery: number;
  totalDeliveryDays: number;
  paymentStatus: "pending" | "completed" | "expired";
  paymentMethod: string | null;
  paidAt: string | null;
  price: number;
  /** Full price before carryover discount (paid + carryover days × salads × price_per_salad). Null when no carryover. */
  originalPrice: number | null;
  /**
   * True when this subscriber has pending compensation credits AND this
   * subscription did not already apply a carryover discount. Used to flag
   * historical overpay / next-month credit cases. When carryoverDays > 0 the
   * discount was applied to payment — never treat as overpaid.
   */
  hasOverpaidCredit: boolean;
  /** Free bonus delivery days carried over from a previous period due to store closure. */
  carryoverDays: number;
  deliveryDates: string[];
  remainingSlots: number;
};

type CarryoverUsageRow = {
  carryover_from_subscription_id: string | null;
  carryover_delivery_days: number | null;
};

// ─── Period status bundle (admin subscription-status page) ─────────────

export type PeriodStatusBundle = {
  dayCounts: Record<string, number>;
  subscribers: PeriodSubscriber[];
};

/**
 * Loads per-day salad counts and the full subscriber roster for one period in
 * a single pass (shared Supabase round trips). Used by the admin
 * subscription-status page to avoid duplicating subscriptions + delivery_days
 * queries across {@link getSubscriptionDayCounts} and
 * {@link getPeriodSubscribers}.
 *
 * Same permission gate as {@link getPeriodSubscribers}.
 */
export async function getPeriodStatusBundle(
  periodId: string
): Promise<PeriodStatusBundle> {
  const empty: PeriodStatusBundle = { dayCounts: {}, subscribers: [] };
  if (!periodId) return empty;

  const role = await getCallerRole();
  if (!isAnyAdmin(role)) {
    console.warn("[getPeriodStatusBundle] caller is not admin – role:", role);
    return empty;
  }
  if (!isSuperAdmin(role) && !(await hasPermission("subscription_status"))) {
    console.warn("[getPeriodStatusBundle] caller lacks subscription_status permission – role:", role);
    return empty;
  }

  const admin = createAdminClient();

  const [
    { data: period, error: periodErr },
    { data: subsRaw, error: subsErr },
    { data: pendingCreditsRaw },
  ] = await Promise.all([
    admin
      .from("subscription_periods")
      .select("price_per_salad")
      .eq("id", periodId)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "id, user_id, frequency_per_week, salads_per_delivery, total_delivery_days, payment_status, payment_method, paid_at, carryover_delivery_days"
      )
      .eq("period_id", periodId),
    admin
      .from("compensation_credits")
      .select("user_id, applied_to_subscription_id")
      .is("applied_at", null),
  ]);

  if (periodErr) console.error("[getPeriodStatusBundle] subscription_periods query error:", periodErr);
  if (subsErr) console.error("[getPeriodStatusBundle] subscriptions query error:", subsErr);

  const pricePerSalad = (period?.price_per_salad as number | null) ?? 0;
  const subs = subsRaw ?? [];
  if (subs.length === 0) {
    console.warn("[getPeriodStatusBundle] no subscriptions found for periodId:", periodId, "subsErr:", subsErr?.message ?? null);
    return empty;
  }

  const userIds = [...new Set(subs.map((s: any) => s.user_id as string))];
  const subIds = subs.map((s: any) => s.id as string);
  const subIdSet = new Set(subIds);

  // Pending credits reserved on this period's subscriptions are already being
  // used for the current discount — they must not flip the row into the
  // "overpaid / show full price" display path.
  const usersWithPendingCredits = new Set<string>();
  for (const row of (pendingCreditsRaw ?? []) as {
    user_id: string;
    applied_to_subscription_id: string | null;
  }[]) {
    const reservedOnThisPeriod =
      !!row.applied_to_subscription_id &&
      subIdSet.has(row.applied_to_subscription_id);
    if (!reservedOnThisPeriod) {
      usersWithPendingCredits.add(row.user_id);
    }
  }
  const saladsBySubId = new Map<string, number>();
  for (const s of subs) {
    saladsBySubId.set(s.id as string, (s.salads_per_delivery as number | null) ?? 1);
  }

  const [{ data: profiles }, { data: deliveryRows }, { data: carryoverRows }, { data: skippedRows }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, real_name, status")
        .in("id", userIds),
      admin
        .from("delivery_days")
        .select("subscription_id, week_start, selected_days, user_id")
        .in("subscription_id", subIds),
      admin
        .from("subscriptions")
        .select("carryover_from_subscription_id, carryover_delivery_days")
        .in("carryover_from_subscription_id", subIds),
      admin
        .from("skipped_delivery_days")
        .select("subscription_id, delivery_date")
        .in("subscription_id", subIds),
    ]);

  const profileMap = new Map<
    string,
    { realName: string; disabled: boolean }
  >();
  const disabledUserIds = new Set<string>();
  for (const p of profiles ?? []) {
    const id = p.id as string;
    const disabled = (p.status as string) === "disabled";
    profileMap.set(id, {
      realName: (p.real_name as string) || "이름 없음",
      disabled,
    });
    if (disabled) disabledUserIds.add(id);
  }

  const skippedKeys = buildSkippedDateKeySet(skippedRows ?? []);

  const dateCounts = countSaladsPerDateFromDeliveryRows(
    (deliveryRows ?? []) as any,
    skippedKeys,
    saladsBySubId,
    disabledUserIds
  );

  const datesBySub = expandActiveDeliveryDatesBySub(
    (deliveryRows ?? []) as any,
    skippedKeys
  );

  const usedCarryoverBySource = new Map<string, number>();
  for (const row of (carryoverRows ?? []) as CarryoverUsageRow[]) {
    const sourceId = row.carryover_from_subscription_id as string | null;
    if (!sourceId) continue;
    usedCarryoverBySource.set(
      sourceId,
      (usedCarryoverBySource.get(sourceId) ?? 0) +
        (row.carryover_delivery_days ?? 0)
    );
  }

  const result: PeriodSubscriber[] = [];
  for (const sub of subs) {
    const profile = profileMap.get(sub.user_id as string);
    if (!profile || profile.disabled) continue;

    const salads = (sub.salads_per_delivery as number | null) ?? 1;
    const frequency = (sub.frequency_per_week as number | null) ?? 0;
    const deliveryDates = [...(datesBySub.get(sub.id as string) ?? [])].sort();
    const paymentStatus =
      (sub.payment_status as PeriodSubscriber["paymentStatus"]) ?? "pending";

    // Hide TRUE ghost rows only — paid subscribers stay even with zero dates
    // (see getPeriodSubscribers doc / SubscriberRow).
    if (paymentStatus !== "completed" && deliveryDates.length === 0) continue;

    const carryoverDays = (sub.carryover_delivery_days as number | null) ?? 0;
    const totalDeliveryDays = getPaidDeliveryDaysForBilling({
      totalDeliveryDays: sub.total_delivery_days as number | null,
      frequencyPerWeek: frequency,
      carryoverDeliveryDays: carryoverDays,
      selectedDeliveryDayCount: deliveryDates.length,
    });
    const { price, originalPrice } = getSubscriptionPrice({
      paidDeliveryDays: totalDeliveryDays,
      saladsPerDelivery: salads,
      pricePerSalad,
      carryoverDeliveryDays: carryoverDays,
    });

    // Carryover dates are free extras on top of the base plan. Exclude them
    // from the "slots filled" count so remainingSlots reflects only how many
    // base-plan dates the subscriber still needs to choose.
    const baseDatesFilled = Math.max(0, deliveryDates.length - carryoverDays);

    result.push({
      subscriptionId: sub.id as string,
      userId: sub.user_id as string,
      realName: profile.realName,
      frequencyPerWeek: frequency,
      saladsPerDelivery: salads,
      totalDeliveryDays,
      paymentStatus,
      paymentMethod: (sub.payment_method as string | null) ?? null,
      paidAt: (sub.paid_at as string | null) ?? null,
      price,
      originalPrice,
      // If carryover was applied on this subscription, payment already used the
      // discounted amount (matches /subscription). Only flag overpaid when the
      // user still has unused pending credits and no discount on this row.
      hasOverpaidCredit:
        carryoverDays === 0 &&
        usersWithPendingCredits.has(sub.user_id as string),
      carryoverDays,
      deliveryDates,
      remainingSlots: Math.max(
        0,
        totalDeliveryDays -
          baseDatesFilled -
          (usedCarryoverBySource.get(sub.id as string) ?? 0)
      ),
    });
  }

  result.sort((a, b) => {
    const aTotal = a.totalDeliveryDays * a.saladsPerDelivery;
    const bTotal = b.totalDeliveryDays * b.saladsPerDelivery;
    if (aTotal !== bTotal) return bTotal - aTotal;

    const aSig = a.deliveryDates.join(",");
    const bSig = b.deliveryDates.join(",");
    if (aSig !== bSig) return aSig.localeCompare(bSig);

    return a.realName.localeCompare(b.realName, "ko");
  });

  return { dayCounts: dateCounts, subscribers: result };
}

/**
 * Returns the full detail for every subscriber of a given subscription
 * period, intended for the admin subscription-status page. For each user it
 * includes payment info, derived price (based on the period's
 * `price_per_salad`), the list of selected delivery dates, and how many
 * additional dates the user is still entitled to pick based on
 * `total_delivery_days`.
 *
 * Gated behind the `subscription_status` permission so regular vendor-only
 * admins can't call it. Disabled users are excluded to mirror
 * `getSubscribersForDate` and the home "구독 현황" view.
 */
export async function getPeriodSubscribers(
  periodId: string
): Promise<PeriodSubscriber[]> {
  const { subscribers } = await getPeriodStatusBundle(periodId);
  return subscribers;
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

  // A delivery-day row can only cover today if its week_start falls within
  // the last 7 days (day offsets are 0–6) — avoids scanning the whole table.
  const weekStartFloor = new Date(todayStr + "T00:00:00");
  weekStartFloor.setDate(weekStartFloor.getDate() - 6);
  const weekStartFloorStr = formatDateISO(weekStartFloor);

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
        .select("user_id, week_start, selected_days")
        .gte("week_start", weekStartFloorStr)
        .lte("week_start", todayStr),
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

// ─── Compensation Credits ─────────────────────────────────────────────────────

export type CompensationCredit = {
  id: string;
  userId: string;
  realName: string;
  days: number;
  sourcePeriod: string;
  reason: string | null;
  adminNotes: string | null;
  appliedToSubscriptionId: string | null;
  appliedAt: string | null;
  createdAt: string;
};

export async function getCompensationCredits(): Promise<CompensationCredit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compensation_credits")
    .select(
      "id, user_id, days, source_period, reason, admin_notes, applied_to_subscription_id, applied_at, created_at, profiles(real_name)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getCompensationCredits]", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    userId: row.user_id as string,
    realName: (row.profiles?.real_name as string | null) ?? row.user_id,
    days: row.days as number,
    sourcePeriod: row.source_period as string,
    reason: (row.reason as string | null) ?? null,
    adminNotes: (row.admin_notes as string | null) ?? null,
    appliedToSubscriptionId:
      (row.applied_to_subscription_id as string | null) ?? null,
    appliedAt: (row.applied_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function addCompensationCredit(params: {
  userId: string;
  days: number;
  sourcePeriod: string;
  reason?: string;
  adminNotes?: string;
}): Promise<ActionResult> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("compensation_credits").insert({
    user_id: params.userId,
    days: params.days,
    source_period: params.sourcePeriod,
    reason: params.reason ?? null,
    admin_notes: params.adminNotes ?? null,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function updateCompensationCredit(
  id: string,
  patches: {
    days?: number;
    sourcePeriod?: string;
    reason?: string | null;
    adminNotes?: string | null;
  }
): Promise<ActionResult> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (patches.days !== undefined) update.days = patches.days;
  if (patches.sourcePeriod !== undefined)
    update.source_period = patches.sourcePeriod;
  if (patches.reason !== undefined) update.reason = patches.reason;
  if (patches.adminNotes !== undefined) update.admin_notes = patches.adminNotes;

  const { error } = await supabase
    .from("compensation_credits")
    .update(update)
    .eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function deleteCompensationCredit(
  id: string
): Promise<ActionResult> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("compensation_credits")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };
  return { success: true };
}

export async function revertCompensationCreditApplication(
  id: string
): Promise<ActionResult> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("compensation_credits")
    .update({
      applied_at: null,
      applied_to_subscription_id: null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/compensation");
  return { success: true };
}

export async function restoreArchivedCompensationCredit(
  subscriptionId: string
): Promise<ActionResult> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }

  const admin = createAdminClient();
  const archiveNote = `archive:applied:${subscriptionId}`;

  const { data: existingArchive } = await admin
    .from("compensation_credits")
    .select("id")
    .eq("admin_notes", archiveNote)
    .maybeSingle();

  if (existingArchive) {
    return { error: "이미 복원된 기록이 있습니다" };
  }

  const { data: sub } = await admin
    .from("subscriptions")
    .select(
      "id, user_id, payment_status, carryover_delivery_days, carryover_from_subscription_id, paid_at, updated_at, subscription_periods(target_month, delivery_start)"
    )
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!sub) return { error: "구독을 찾을 수 없어요" };
  if ((sub.payment_status as string) !== "completed") {
    return { error: "결제 완료된 구독만 복원할 수 있어요" };
  }

  const carryoverDays = (sub.carryover_delivery_days as number | null) ?? 0;
  if (carryoverDays <= 0) {
    return { error: "보상일이 사용된 구독이 아니에요" };
  }

  const periodRow = sub.subscription_periods as
    | { target_month: string; delivery_start: string }
    | { target_month: string; delivery_start: string }[]
    | null;
  const appliedPeriod = Array.isArray(periodRow)
    ? periodRow[0]?.target_month
    : periodRow?.target_month;
  const appliedStart = Array.isArray(periodRow)
    ? periodRow[0]?.delivery_start
    : periodRow?.delivery_start;

  const { data: prevSubs } = await admin
    .from("subscriptions")
    .select("subscription_periods(target_month, delivery_start)")
    .eq("user_id", sub.user_id as string)
    .eq("payment_status", "completed")
    .order("created_at", { ascending: false });

  let sourcePeriod = appliedPeriod ?? "출처 미상";
  if (appliedStart) {
    for (const row of prevSubs ?? []) {
      const sp = row.subscription_periods as
        | { target_month: string; delivery_start: string }
        | { target_month: string; delivery_start: string }[]
        | null;
      const prev = Array.isArray(sp) ? sp[0] : sp;
      if (prev?.delivery_start && prev.delivery_start < appliedStart) {
        sourcePeriod = prev.target_month;
        break;
      }
    }
  }

  const appliedAt =
    (sub.paid_at as string | null) ??
    (sub.updated_at as string | null) ??
    new Date().toISOString();

  const { error } = await admin.from("compensation_credits").insert({
    user_id: sub.user_id as string,
    days: carryoverDays,
    source_period: sourcePeriod,
    reason: `${appliedPeriod ?? "구독"}에 보상 적용 (기록 복원)`,
    admin_notes: archiveNote,
    applied_to_subscription_id: subscriptionId,
    applied_at: appliedAt,
    created_at: appliedAt,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/compensation");
  return { success: true };
}

/** Returns total pending (unapplied) compensation days for a user. */
export async function getPendingCompensationDays(
  userId: string
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compensation_credits")
    .select("days")
    .eq("user_id", userId)
    .is("applied_at", null);

  return (data ?? []).reduce(
    (sum: number, row: any) => sum + (row.days as number),
    0
  );
}

/** Returns the set of user IDs that have at least one pending credit. */
export async function getUsersWithPendingCredits(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compensation_credits")
    .select("user_id")
    .is("applied_at", null);

  return new Set((data ?? []).map((r: any) => r.user_id as string));
}

// ─── Admin Per-User Detail ───────────────────────────────────────────────────

export interface AdminUserSubscriptionEntry {
  subscription: {
    id: string;
    periodId: string;
    targetMonth: string;
    frequencyPerWeek: number;
    saladsPerDelivery: number;
    totalDeliveryDays: number | null;
    paymentStatus: string;
    paymentMethod: string | null;
    carryoverDays: number;
  };
  deliveryDateStrings: string[];
  /** Vacation skips — generate a next-month compensation credit. */
  skippedDates: string[];
  /** Same-month reschedule skips — no credit, original date moved elsewhere. */
  rescheduledDates: string[];
  deliveryStart: string | null;
  deliveryEnd: string | null;
}

export interface AdminUserDetail {
  profile: {
    id: string;
    email: string;
    realName: string;
    nickname: string;
    role: string;
    status: string;
    createdAt: string;
  };
  subscriptionEntries: AdminUserSubscriptionEntry[];
  compensationCredits: CompensationCredit[];
}

export async function getAdminUserDetail(
  userId: string
): Promise<AdminUserDetail | null> {
  if (!(await hasPermission("users.view"))) return null;

  const supabase = await createClient();

  // Fetch profile
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, email, real_name, nickname, role, status, created_at")
    .eq("id", userId)
    .single();

  if (!profileRow) return null;

  // Fetch subscriptions with period info
    const { data: subs } = await supabase
    .from("subscriptions")
    .select(
      "id, period_id, frequency_per_week, salads_per_delivery, total_delivery_days, carryover_delivery_days, payment_status, payment_method, subscription_periods(target_month, delivery_start, delivery_end)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const { expandDeliveryDaysToDateStrings } = await import(
    "@/lib/delivery-days"
  );

  // Two batched queries instead of 2 round-trips per subscription.
  const subIds = (subs ?? []).map((sub: { id: string }) => sub.id);
  const [{ data: allDdRows }, { data: allSkipRows }] = subIds.length
    ? await Promise.all([
        supabase
          .from("delivery_days")
          .select("subscription_id, week_start, selected_days")
          .in("subscription_id", subIds),
        supabase
          .from("skipped_delivery_days")
          .select("subscription_id, delivery_date, skip_reason")
          .in("subscription_id", subIds),
      ])
    : [{ data: [] }, { data: [] }];

  const ddBySub = new Map<string, { week_start: string; selected_days: number[] | null }[]>();
  for (const row of (allDdRows ?? []) as any[]) {
    const list = ddBySub.get(row.subscription_id) ?? [];
    list.push(row);
    ddBySub.set(row.subscription_id, list);
  }
  const skipBySub = new Map<string, { delivery_date: string; skip_reason: string | null }[]>();
  for (const row of (allSkipRows ?? []) as any[]) {
    const list = skipBySub.get(row.subscription_id) ?? [];
    list.push(row);
    skipBySub.set(row.subscription_id, list);
  }

  const subscriptionEntries: AdminUserSubscriptionEntry[] = [];

  for (const sub of subs ?? []) {
    const deliveryDateStrings = expandDeliveryDaysToDateStrings(
      ddBySub.get(sub.id) ?? []
    );

    // Vacation skips are removed from delivery_days at skip time, and restored on unskip.
    // Reschedule actions maintain delivery_days and clean up skipped_delivery_days for
    // replacement dates, so simple reason-based filtering is safe here.
    const skipRows = skipBySub.get(sub.id) ?? [];
    const skippedDates = skipRows
      .filter((r) => r.skip_reason !== "reschedule")
      .map((r) => r.delivery_date);
    const rescheduledDates = skipRows
      .filter((r) => r.skip_reason === "reschedule")
      .map((r) => r.delivery_date);

    const period = sub.subscription_periods as any;

    subscriptionEntries.push({
      subscription: {
        id: sub.id,
        periodId: sub.period_id,
        targetMonth: period?.target_month ?? sub.period_id,
        frequencyPerWeek: sub.frequency_per_week,
        saladsPerDelivery: sub.salads_per_delivery ?? 1,
        totalDeliveryDays: sub.total_delivery_days ?? null,
        paymentStatus: sub.payment_status ?? "pending",
        paymentMethod: sub.payment_method ?? null,
        carryoverDays: (sub.carryover_delivery_days as number | null) ?? 0,
      },
      deliveryDateStrings,
      skippedDates,
      rescheduledDates,
      deliveryStart: period?.delivery_start ?? null,
      deliveryEnd: period?.delivery_end ?? null,
    });
  }

  // Fetch compensation credits for this user
  const { data: credits } = await supabase
    .from("compensation_credits")
    .select("id, user_id, days, source_period, reason, admin_notes, applied_to_subscription_id, applied_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const compensationCredits: CompensationCredit[] = (credits ?? []).map(
    (row: any) => ({
      id: row.id,
      userId: row.user_id,
      realName: (profileRow as any).real_name,
      days: row.days,
      sourcePeriod: row.source_period,
      reason: row.reason ?? null,
      adminNotes: row.admin_notes ?? null,
      appliedToSubscriptionId: row.applied_to_subscription_id ?? null,
      appliedAt: row.applied_at ?? null,
      createdAt: row.created_at,
    })
  );

  return {
    profile: {
      id: (profileRow as any).id,
      email: (profileRow as any).email,
      realName: (profileRow as any).real_name,
      nickname: (profileRow as any).nickname,
      role: (profileRow as any).role,
      status: (profileRow as any).status,
      createdAt: (profileRow as any).created_at,
    },
    subscriptionEntries,
    compensationCredits,
  };
}

/** Admin: skip delivery dates for any user (no 2-day cutoff). */
export async function adminSkipDeliveryDates(
  userId: string,
  subscriptionId: string,
  deliveryDates: string[],
  skipReason?: string
): Promise<{ error?: string; skippedCount?: number }> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }

  const supabase = await createClient();

  // Verify the subscription belongs to userId
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, user_id, subscription_periods(target_month)")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .single();

  if (!sub) return { error: "구독을 찾을 수 없어요." };

  const callerUser = await getAuthUser();
  if (!callerUser) return { error: "로그인이 필요해요." };

  const rows = deliveryDates.map((d) => ({
    user_id: userId,
    subscription_id: subscriptionId,
    delivery_date: d,
    skipped_by: callerUser.id,
    skip_reason: skipReason ?? null,
  }));

  const { error: insertError } = await supabase
    .from("skipped_delivery_days")
    .upsert(rows, { onConflict: "subscription_id,delivery_date" });

  if (insertError) return { error: insertError.message };

  // Remove skipped dates from delivery_days (same as user-side skipDeliveryDates).
  for (const dateStr of deliveryDates) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    const { data: ddRow } = await supabase
      .from("delivery_days")
      .select("id, selected_days")
      .eq("subscription_id", subscriptionId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (ddRow) {
      const updated = ((ddRow.selected_days as number[]) ?? []).filter((day) => day !== dow);
      if (updated.length === 0) {
        await supabase.from("delivery_days").delete().eq("id", ddRow.id);
      } else {
        await supabase.from("delivery_days").update({ selected_days: updated }).eq("id", ddRow.id);
      }
    }
  }

  // Sync credit — count vacation skips (null reason or any non-reschedule reason).
  // .neq("skip_reason","reschedule") alone would exclude null rows in SQL.
  const { count } = await supabase
    .from("skipped_delivery_days")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .or("skip_reason.is.null,skip_reason.neq.reschedule");

  const totalSkipped = count ?? 0;
  const period = sub.subscription_periods as { target_month: string } | null;

  const { data: existing } = await supabase
    .from("compensation_credits")
    .select("id")
    .eq("user_id", userId)
    .eq("source_subscription_id" as any, subscriptionId)
    .is("applied_at", null)
    .maybeSingle();

  const targetMonth = period?.target_month ?? null;
  const monthMatch = targetMonth?.match(/(\d+)월/);
  const reasonStr = monthMatch ? `${monthMatch[1]}월 구독 연기` : "구독 연기";

  if (existing) {
    await supabase
      .from("compensation_credits")
      .update({ days: totalSkipped, reason: reasonStr })
      .eq("id", existing.id);
  } else {
    await supabase.from("compensation_credits").insert({
      user_id: userId,
      days: totalSkipped,
      source_period: targetMonth,
      source_subscription_id: subscriptionId,
      reason: reasonStr,
    });
  }

  revalidateDeliveryScheduleViews(userId);
  revalidatePath("/admin/users");

  return { skippedCount: deliveryDates.length };
}

/** Admin: unskip delivery dates for any user. */
export async function adminUnskipDeliveryDates(
  userId: string,
  subscriptionId: string,
  deliveryDates: string[]
): Promise<{ error?: string }> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }

  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("skipped_delivery_days")
    .delete()
    .eq("subscription_id", subscriptionId)
    .in("delivery_date", deliveryDates);

  if (delError) return { error: delError.message };

  // Restore dates back into delivery_days
  for (const dateStr of deliveryDates) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    const { data: ddRow } = await supabase
      .from("delivery_days")
      .select("id, selected_days")
      .eq("subscription_id", subscriptionId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (ddRow) {
      const days = (ddRow.selected_days as number[]) ?? [];
      if (!days.includes(dow)) {
        await supabase
          .from("delivery_days")
          .update({ selected_days: [...days, dow].sort((a, b) => a - b) })
          .eq("id", ddRow.id);
      }
    } else {
      await supabase.from("delivery_days").insert({
        user_id: userId,
        subscription_id: subscriptionId,
        week_start: weekStart,
        selected_days: [dow],
      });
    }
  }

  // Re-sync credit — same null-safe OR filter
  const { count } = await supabase
    .from("skipped_delivery_days")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .or("skip_reason.is.null,skip_reason.neq.reschedule");

  const totalSkipped = count ?? 0;

  const { data: existing } = await supabase
    .from("compensation_credits")
    .select("id")
    .eq("user_id", userId)
    .eq("source_subscription_id" as any, subscriptionId)
    .is("applied_at", null)
    .maybeSingle();

  if (existing) {
    if (totalSkipped === 0) {
      await supabase.from("compensation_credits").delete().eq("id", existing.id);
    } else {
      await supabase
        .from("compensation_credits")
        .update({ days: totalSkipped })
        .eq("id", existing.id);
    }
  }

  revalidateDeliveryScheduleViews(userId);
  revalidatePath("/admin/users");

  return {};
}

/** Admin: reschedule delivery dates within the same month for any user. */
export async function adminRescheduleDeliveryDates(
  userId: string,
  subscriptionId: string,
  datesToSkip: string[],
  replacementDates: string[]
): Promise<{ error?: string }> {
  if (!(await hasPermission("subscription_status"))) {
    return { error: "권한이 없습니다" };
  }

  const supabase = await createClient();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, user_id")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .single();
  if (!sub) return { error: "구독을 찾을 수 없어요." };

  const callerUser = await getAuthUser();
  if (!callerUser) return { error: "로그인이 필요해요." };

  // Remove each skipped date's DOW from delivery_days
  for (const dateStr of datesToSkip) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    const monday = new Date(d);
    const diff = dow === 0 ? 6 : dow - 1;
    monday.setDate(monday.getDate() - diff);
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    const { data: existing } = await supabase
      .from("delivery_days")
      .select("id, selected_days")
      .eq("subscription_id", subscriptionId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing) {
      const days = (existing.selected_days as number[]) ?? [];
      const updated = days.filter((x) => x !== dow);
      if (updated.length === 0) {
        await supabase.from("delivery_days").delete().eq("id", existing.id);
      } else {
        await supabase.from("delivery_days").update({ selected_days: updated }).eq("id", existing.id);
      }
    }
  }

  // Insert skip records
  if (datesToSkip.length > 0) {
    const skipRows = datesToSkip.map((date) => ({
      user_id: userId,
      subscription_id: subscriptionId,
      delivery_date: date,
      skipped_by: callerUser.id,
      skip_reason: "reschedule",
    }));
    const { error: skipError } = await supabase
      .from("skipped_delivery_days")
      .upsert(skipRows, { onConflict: "subscription_id,delivery_date" });
    if (skipError) return { error: skipError.message };
  }

  // Add replacement dates to delivery_days
  for (const dateStr of replacementDates) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    const monday = new Date(d);
    const diff = dow === 0 ? 6 : dow - 1;
    monday.setDate(monday.getDate() - diff);
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    const { data: existing } = await supabase
      .from("delivery_days")
      .select("id, selected_days")
      .eq("subscription_id", subscriptionId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing) {
      const days = (existing.selected_days as number[]) ?? [];
      if (!days.includes(dow)) {
        await supabase
          .from("delivery_days")
          .update({ selected_days: [...days, dow].sort((a, b) => a - b) })
          .eq("id", existing.id);
      }
    } else {
      await supabase.from("delivery_days").insert({
        user_id: userId,
        subscription_id: subscriptionId,
        week_start: weekStart,
        selected_days: [dow],
      });
    }
  }

  // Remove replacement dates from skipped list (un-skip them)
  if (replacementDates.length > 0) {
    await supabase
      .from("skipped_delivery_days")
      .delete()
      .eq("subscription_id", subscriptionId)
      .in("delivery_date", replacementDates);
  }

  revalidateDeliveryScheduleViews(userId);
  revalidatePath("/admin/users");
  return {};
}
