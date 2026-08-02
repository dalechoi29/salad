"use server";

import { createClient, createAdminClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath, updateTag } from "next/cache";
import type { ActionResult, DeliveryDay } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expandDeliveryDaysToDateStrings } from "@/lib/delivery-days";
import { hasOpenSubscriptionHold } from "@/lib/subscription-hold-guard";
import { formatDateISO, getKSTDate, isSelectionClosed } from "@/lib/utils";

// Remove any user_menu_selections whose delivery_date is no longer in the user's
// saved delivery_days for this subscription. Without this, if a user moves their
// delivery from e.g. Apr 7 → Apr 8, the old Apr 7 selection would linger and
// skew the vendor report (especially for users with salads_per_delivery > 1).
async function cleanupStaleSelectionsForSubscription(
  client: SupabaseClient,
  userId: string,
  subscriptionId: string,
  newDeliveryDates: string[]
): Promise<void> {
  const { data: sub } = await client
    .from("subscriptions")
    .select("subscription_periods(delivery_start, delivery_end)")
    .eq("id", subscriptionId)
    .single();

  const period = (sub as any)?.subscription_periods;
  if (!period?.delivery_start || !period?.delivery_end) return;

  const rangeStart = period.delivery_start.slice(0, 10);
  const rangeEnd = period.delivery_end.slice(0, 10);

  const { data: existingSelections } = await client
    .from("user_menu_selections")
    .select("id, delivery_date")
    .eq("user_id", userId)
    .gte("delivery_date", rangeStart)
    .lte("delivery_date", rangeEnd);

  if (!existingSelections?.length) return;

  const keepSet = new Set(newDeliveryDates);
  const staleIds = existingSelections
    .filter((s: any) => !keepSet.has(s.delivery_date))
    .map((s: any) => s.id);

  if (staleIds.length > 0) {
    await client.from("user_menu_selections").delete().in("id", staleIds);
  }
}

function expandWeekSelectionToDateStrings(
  weekStart: string,
  selectedDays: number[]
): string[] {
  return expandDeliveryDaysToDateStrings([
    { week_start: weekStart, selected_days: selectedDays },
  ]);
}

async function getBlockedDateSet(
  client: SupabaseClient,
  dates: string[]
): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const sorted = [...new Set(dates)].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];

  const [{ data: holidays }, { data: closures }] = await Promise.all([
    client
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", start)
      .lte("holiday_date", end),
    client
      .from("store_closures")
      .select("closure_date")
      .gte("closure_date", start)
      .lte("closure_date", end),
  ]);

  return new Set([
    ...((holidays ?? []) as any[]).map((h) => h.holiday_date as string),
    ...((closures ?? []) as any[]).map((c) => c.closure_date as string),
  ]);
}

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getClosedByDeadlineDate(
  client: SupabaseClient,
  dates: string[]
): Promise<string | null> {
  if (dates.length === 0) return null;
  const sorted = [...new Set(dates)].sort();
  const weekStarts = [...new Set(sorted.map(getMondayISO))];
  const [{ data: settingsRows }, { data: deadlineRows }] = await Promise.all([
    client.from("admin_settings").select("key, value"),
    client
      .from("menu_selection_deadlines")
      .select("week_start, deadline_at")
      .in("week_start", weekStarts),
  ]);
  const settings: Record<string, string> = {};
  for (const row of settingsRows ?? []) settings[row.key] = row.value;
  const cutoffDay = parseInt(settings.menu_selection_cutoff_day ?? "4", 10);
  const cutoffTime = settings.menu_selection_cutoff_time ?? "23:59";
  const overrideMap = new Map(
    (deadlineRows ?? []).map((row: any) => [
      row.week_start as string,
      row.deadline_at as string,
    ])
  );

  for (const date of sorted) {
    const override = overrideMap.get(getMondayISO(date));
    const closed = override
      ? new Date() >= new Date(override)
      : isSelectionClosed(date, cutoffDay, cutoffTime);
    if (closed) return date;
  }
  return null;
}

export async function getMyDeliveryDays(
  subscriptionId: string
): Promise<DeliveryDay[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("*")
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId)
    .order("week_start");

  return (data as DeliveryDay[]) ?? [];
}

/**
 * Returns the actual delivery date strings (YYYY-MM-DD) the user chose in
 * their most recent subscription period OTHER than `currentPeriodId`.
 * Used to show ghost dots on the calendar when subscribing to a new period
 * for the first time — dots appear only on the exact dates they previously
 * chose, not on every recurring weekday.
 */
export async function getMyPreviousDeliveryDates(
  currentPeriodId: string
): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  // Most recent subscription for another period, with its delivery days
  // embedded — one round trip instead of two sequential queries.
  const { data: prevSubs } = await supabase
    .from("subscriptions")
    .select("id, delivery_days(week_start, selected_days)")
    .eq("user_id", user.id)
    .neq("period_id", currentPeriodId)
    .order("created_at", { ascending: false })
    .limit(1);

  const days = (prevSubs?.[0]?.delivery_days ?? []) as {
    week_start: string;
    selected_days: number[] | null;
  }[];
  if (!days.length) return [];

  return expandDeliveryDaysToDateStrings(days).sort();
}

export async function getMyDeliveryDaysBySubscriptionIds(
  subscriptionIds: string[]
): Promise<Record<string, DeliveryDay[]>> {
  const uniqueIds = [...new Set(subscriptionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return {};

  const { data } = await supabase
    .from("delivery_days")
    .select("*")
    .eq("user_id", user.id)
    .in("subscription_id", uniqueIds)
    .order("week_start");

  const grouped: Record<string, DeliveryDay[]> = {};
  for (const id of uniqueIds) grouped[id] = [];
  for (const row of (data as DeliveryDay[]) ?? []) {
    (grouped[row.subscription_id] ??= []).push(row);
  }
  return grouped;
}

/** All delivery-day rows for the current user, grouped by subscription. */
export async function getMyDeliveryDaysGrouped(): Promise<
  Record<string, DeliveryDay[]>
> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return {};

  const { data } = await supabase
    .from("delivery_days")
    .select("*")
    .eq("user_id", user.id)
    .order("week_start");

  const grouped: Record<string, DeliveryDay[]> = {};
  for (const row of (data as DeliveryDay[]) ?? []) {
    (grouped[row.subscription_id] ??= []).push(row);
  }
  return grouped;
}

export async function getMyDeliveryDateStrings(): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("user_id", user.id)
    .order("week_start");

  if (!data?.length) return [];

  const dates: string[] = [];
  for (const dd of data) {
    for (const dayOfWeek of dd.selected_days ?? []) {
      const ws = new Date(dd.week_start + "T00:00:00");
      ws.setDate(ws.getDate() + (dayOfWeek - 1));
      const y = ws.getFullYear();
      const m = String(ws.getMonth() + 1).padStart(2, "0");
      const d = String(ws.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
  }
  return dates.sort();
}

export async function adminGetDeliveryDates(
  subscriptionId: string
): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !["admin", "super_admin"].includes(profile.role)) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("subscription_id", subscriptionId)
    .order("week_start");

  if (!data?.length) return [];

  const dates: string[] = [];
  for (const dd of data) {
    for (const dayOfWeek of dd.selected_days ?? []) {
      const ws = new Date(dd.week_start + "T00:00:00");
      ws.setDate(ws.getDate() + (dayOfWeek - 1));
      const y = ws.getFullYear();
      const m = String(ws.getMonth() + 1).padStart(2, "0");
      const d = String(ws.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
  }
  return dates.sort();
}

export async function adminUpdateDeliveryDates(
  subscriptionId: string,
  userId: string,
  deliveryDates: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !["admin", "super_admin"].includes(profile.role)) {
    return { error: "권한이 없습니다" };
  }

  const admin = createAdminClient();

  const { error: delError } = await admin
    .from("delivery_days")
    .delete()
    .eq("subscription_id", subscriptionId)
    .eq("user_id", userId);
  if (delError) return { error: delError.message };

  if (deliveryDates.length > 0) {
    const weekMap = new Map<string, number[]>();
    for (const ds of deliveryDates) {
      const d = new Date(ds + "T00:00:00");
      const dow = d.getDay();
      const monday = new Date(d);
      const diff = dow === 0 ? 6 : dow - 1;
      monday.setDate(monday.getDate() - diff);
      const wk = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      const days = weekMap.get(wk) ?? [];
      if (!days.includes(dow)) days.push(dow);
      weekMap.set(wk, days);
    }

    const rows = [...weekMap.entries()].map(([weekStart, days]) => ({
      user_id: userId,
      subscription_id: subscriptionId,
      week_start: weekStart,
      selected_days: days.sort((a, b) => a - b),
    }));

    const { error: insError } = await admin.from("delivery_days").insert(rows);
    if (insError) return { error: insError.message };
  }

  // Do not overwrite total_delivery_days here — that field is paid-only days,
  // not selected date count (carryover/comp days must not inflate the price).

  await cleanupStaleSelectionsForSubscription(
    admin,
    userId,
    subscriptionId,
    deliveryDates
  );

  updateTag("day-counts");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function saveDeliveryDays(
  subscriptionId: string,
  weekStart: string,
  selectedDays: number[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("frequency_per_week, total_delivery_days")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!subscription) return { error: "Subscription not found" };

  if (await hasOpenSubscriptionHold(supabase, subscriptionId)) {
    return {
      error:
        "배송·메뉴 홀드 중에는 여기서 배송일을 바꿀 수 없어요. 구독 화면에서 홀드를 취소한 뒤 수정해 주세요.",
    };
  }

  if (
    !subscription.total_delivery_days &&
    selectedDays.length > subscription.frequency_per_week
  ) {
    return {
      error: `최대 ${subscription.frequency_per_week}일까지 선택할 수 있습니다`,
    };
  }

  const validDays = selectedDays.every((d) => d >= 1 && d <= 5);
  if (!validDays) {
    return { error: "월~금만 선택 가능합니다" };
  }

  const selectedDates = expandWeekSelectionToDateStrings(weekStart, selectedDays);
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const pastPick = selectedDates.find((date) => date < todayStr);
  if (pastPick) {
    return { error: `${pastPick}은 지난 날짜라 선택할 수 없습니다` };
  }
  const blockedDateSet = await getBlockedDateSet(supabase, selectedDates);
  const blockedPick = selectedDates.find((date) => blockedDateSet.has(date));
  if (blockedPick) {
    return { error: `${blockedPick}은 공휴일/매장 휴무일이라 선택할 수 없습니다` };
  }
  const deadlineClosedPick = await getClosedByDeadlineDate(supabase, selectedDates);
  if (deadlineClosedPick) {
    return { error: `${deadlineClosedPick}은 메뉴 선택 마감 이후라 선택할 수 없습니다` };
  }

  const { data: existing } = await supabase
    .from("delivery_days")
    .select("id")
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId)
    .eq("week_start", weekStart)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("delivery_days")
      .update({ selected_days: selectedDays })
      .eq("id", existing.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("delivery_days").insert({
      user_id: user.id,
      subscription_id: subscriptionId,
      week_start: weekStart,
      selected_days: selectedDays,
    });

    if (error) return { error: error.message };
  }

  const { data: allRows } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId);
  const newDates = expandDeliveryDaysToDateStrings(allRows ?? []);
  await cleanupStaleSelectionsForSubscription(
    supabase,
    user.id,
    subscriptionId,
    newDates
  );

  updateTag("day-counts");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}

/** Same validation rules as bulkSaveDeliveryDays (past dates, holidays/closures, menu deadlines). */
export async function validateDeliveryDateStringsForSubscription(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dates: string[]
): Promise<{ error?: string }> {
  const todayStr = formatDateISO(getKSTDate());
  const pastPick = dates.find((date) => date < todayStr);
  if (pastPick) {
    return { error: `${pastPick}은 지난 날짜라 선택할 수 없습니다` };
  }
  const blockedDateSet = await getBlockedDateSet(supabase, dates);
  const blockedPick = dates.find((date) => blockedDateSet.has(date));
  if (blockedPick) {
    return {
      error: `${blockedPick}은 공휴일/매장 휴무일이라 선택할 수 없습니다`,
    };
  }
  const deadlineClosedPick = await getClosedByDeadlineDate(
    supabase,
    dates
  );
  if (deadlineClosedPick) {
    return {
      error: `${deadlineClosedPick}은 메뉴 선택 마감 이후라 선택할 수 없습니다`,
    };
  }
  return {};
}

export async function bulkSaveDeliveryDays(
  subscriptionId: string,
  weeklySelections: { weekStart: string; selectedDays: number[] }[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("frequency_per_week, total_delivery_days")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!subscription) return { error: "Subscription not found" };

  if (await hasOpenSubscriptionHold(supabase, subscriptionId)) {
    return {
      error:
        "배송·메뉴 홀드 중에는 여기서 배송일을 바꿀 수 없어요. 구독 화면에서 홀드를 취소한 뒤 수정해 주세요.",
    };
  }

  for (const { selectedDays } of weeklySelections) {
    if (selectedDays.some((d) => d < 1 || d > 5)) {
      return { error: "월~금만 선택 가능합니다" };
    }
    if (
      !subscription.total_delivery_days &&
      selectedDays.length > subscription.frequency_per_week
    ) {
      return {
        error: `최대 ${subscription.frequency_per_week}일까지 선택할 수 있습니다`,
      };
    }
  }

  const selectedDates = expandDeliveryDaysToDateStrings(
    weeklySelections.map((w) => ({
      week_start: w.weekStart,
      selected_days: w.selectedDays,
    }))
  );
  const validation = await validateDeliveryDateStringsForSubscription(
    supabase,
    selectedDates
  );
  if (validation.error) return { error: validation.error };

  const { error: deleteError } = await supabase
    .from("delivery_days")
    .delete()
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId);

  if (deleteError) return { error: deleteError.message };

  if (weeklySelections.length > 0) {
    const rows = weeklySelections
      .filter((w) => w.selectedDays.length > 0)
      .map((w) => ({
        user_id: user.id,
        subscription_id: subscriptionId,
        week_start: w.weekStart,
        selected_days: w.selectedDays,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("delivery_days")
        .insert(rows);

      if (insertError) return { error: insertError.message };
    }
  }

  const newDates = selectedDates;
  await cleanupStaleSelectionsForSubscription(
    supabase,
    user.id,
    subscriptionId,
    newDates
  );

  updateTag("day-counts");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}
