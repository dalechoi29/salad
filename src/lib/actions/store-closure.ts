"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient, getAuthUser } from "@/lib/supabase/server";
import type { ActionResult, StoreClosure } from "@/types";

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateToDayOfWeek(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cur = startDate;
  while (cur <= endDate) {
    dates.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return dates;
}

async function requireAdmin() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "관리자 권한이 필요합니다" as const };
  }

  return { userId: user.id };
}

async function cleanupSelectionsForClosure(
  date: string
): Promise<{ affectedCount: number; affectedSubIds: string[] }> {
  const admin = createAdminClient();
  const weekStart = getMondayISO(date);
  const dayOfWeek = dateToDayOfWeek(date);
  if (dayOfWeek < 1 || dayOfWeek > 5) {
    return { affectedCount: 0, affectedSubIds: [] };
  }

  const { data: rows } = await admin
    .from("delivery_days")
    .select("id, subscription_id, selected_days")
    .eq("week_start", weekStart)
    .contains("selected_days", [dayOfWeek]);

  let affected = 0;
  const affectedSubIds = new Set<string>();
  for (const row of rows ?? []) {
    const nextDays = ((row.selected_days as number[] | null) ?? []).filter(
      (d) => d !== dayOfWeek
    );
    affected++;
    affectedSubIds.add(row.subscription_id as string);

    if (nextDays.length === 0) {
      await admin.from("delivery_days").delete().eq("id", row.id);
    } else {
      await admin
        .from("delivery_days")
        .update({ selected_days: nextDays })
        .eq("id", row.id);
    }
  }

  // Menu picks on a closed date should not remain in reports.
  await admin.from("user_menu_selections").delete().eq("delivery_date", date);

  return { affectedCount: affected, affectedSubIds: [...affectedSubIds] };
}

export const getStoreClosures = cache(async function getStoreClosures(
  year?: number
): Promise<StoreClosure[]> {
  const supabase = await createClient();
  let query = supabase.from("store_closures").select("*").order("closure_date");

  if (year) {
    query = query
      .gte("closure_date", `${year}-01-01`)
      .lt("closure_date", `${year + 1}-01-01`);
  }

  const { data } = await query;
  return (data as StoreClosure[]) ?? [];
});

export async function addStoreClosure(
  date: string,
  reason: string,
  memo = ""
): Promise<ActionResult & { affectedCount?: number }> {
  return addStoreClosureRange(date, date, reason, memo);
}

export async function addStoreClosureRange(
  startDate: string,
  endDate: string,
  reason: string,
  memo = ""
): Promise<ActionResult & { affectedCount?: number; dateCount?: number }> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const normalizedEndDate = endDate || startDate;
  if (!startDate || normalizedEndDate < startDate) {
    return { error: "휴무 종료일은 시작일보다 빠를 수 없습니다" };
  }

  const dates = getDateRange(startDate, normalizedEndDate);
  if (dates.length > 62) {
    return { error: "한 번에 최대 62일까지만 등록할 수 있습니다" };
  }

  const admin = createAdminClient();
  const rows = dates.map((date) => ({
    closure_date: date,
    reason: reason || "매장 휴무",
    memo,
    created_by: auth.userId,
  }));

  const { error } = await admin
    .from("store_closures")
    .upsert(rows, { onConflict: "closure_date" });

  if (error) {
    return { error: error.message };
  }

  let affectedCount = 0;
  const directlyAffectedSubIds = new Set<string>();
  for (const date of dates) {
    const cleanup = await cleanupSelectionsForClosure(date);
    affectedCount += cleanup.affectedCount;
    for (const subId of cleanup.affectedSubIds) directlyAffectedSubIds.add(subId);
  }

  // Remember the subscriptions whose selected dates were directly removed
  // because of this closure. This keeps closure-reselection UX separate from
  // ordinary incomplete signup cases (paid but never selected any date).
  if (directlyAffectedSubIds.size > 0) {
    await admin
      .from("subscriptions")
      .update({ closure_reselection_required: true })
      .in("id", [...directlyAffectedSubIds]);
  }

  revalidatePath("/", "layout");
  revalidatePath("/delivery");
  revalidatePath("/menu");
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");

  return { success: true, affectedCount, dateCount: dates.length };
}

export async function removeStoreClosure(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("store_closures").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/delivery");
  revalidatePath("/menu");
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  return { success: true };
}

export type StoreClosureReplacementNeed = {
  subscriptionId: string;
  userId: string;
  realName: string;
  targetMonth: string;
  selectedCount: number;
  requiredCount: number;
  remainingSlots: number;
};

type CarryoverUsageRow = {
  carryover_from_subscription_id: string | null;
  carryover_delivery_days: number | null;
};

function countSelectedDays(
  rows: { selected_days: number[] | null }[]
): number {
  return rows.reduce((sum, row) => sum + ((row.selected_days ?? []).length), 0);
}

export async function getStoreClosureReplacementNeeds(): Promise<
  StoreClosureReplacementNeed[]
> {
  const auth = await requireAdmin();
  if ("error" in auth) return [];

  const admin = createAdminClient();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { data: periods } = await admin
    .from("subscription_periods")
    .select("id, target_month, delivery_start, delivery_end")
    .gte("delivery_end", todayStr)
    .order("delivery_start", { ascending: true });

  const relevantPeriods = [];
  for (const period of periods ?? []) {
    if (!period.delivery_start || !period.delivery_end) continue;
    const { data: closures } = await admin
      .from("store_closures")
      .select("id")
      .gte("closure_date", period.delivery_start)
      .lte("closure_date", period.delivery_end)
      .limit(1);
    if (closures && closures.length > 0) relevantPeriods.push(period);
  }

  if (relevantPeriods.length === 0) return [];

  const periodIds = relevantPeriods.map((p) => p.id as string);
  const periodMap = new Map(
    relevantPeriods.map((p) => [p.id as string, p.target_month as string])
  );

  const { data: subs } = await admin
    .from("subscriptions")
    .select("id, user_id, period_id, frequency_per_week, total_delivery_days")
    .in("period_id", periodIds)
    .eq("payment_status", "completed");

  if (!subs?.length) return [];

  const subIds = subs.map((s: any) => s.id as string);
  const userIds = [...new Set(subs.map((s: any) => s.user_id as string))];
  const [{ data: deliveryRows }, { data: profiles }, { data: carryoverRows }] = await Promise.all([
    admin
      .from("delivery_days")
      .select("subscription_id, selected_days")
      .in("subscription_id", subIds),
    admin.from("profiles").select("id, real_name, status").in("id", userIds),
    admin
      .from("subscriptions")
      .select("carryover_from_subscription_id, carryover_delivery_days")
      .in("carryover_from_subscription_id", subIds),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p: any) => [
      p.id as string,
      {
        realName: (p.real_name as string) || "이름 없음",
        disabled: p.status === "disabled",
      },
    ])
  );

  const rowsBySub = new Map<string, { selected_days: number[] | null }[]>();
  for (const row of deliveryRows ?? []) {
    const subId = row.subscription_id as string;
    const arr = rowsBySub.get(subId) ?? [];
    arr.push({ selected_days: row.selected_days as number[] | null });
    rowsBySub.set(subId, arr);
  }

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

  const needs: StoreClosureReplacementNeed[] = [];
  for (const sub of subs as any[]) {
    const profile = profileMap.get(sub.user_id as string);
    if (!profile || profile.disabled) continue;
    const requiredCount =
      (sub.total_delivery_days as number | null) ||
      ((sub.frequency_per_week as number | null) ?? 0) * 4;
    if (requiredCount <= 0) continue;
    const selectedCount = countSelectedDays(rowsBySub.get(sub.id as string) ?? []);
    const remainingSlots = Math.max(
      0,
      requiredCount -
        selectedCount -
        (usedCarryoverBySource.get(sub.id as string) ?? 0)
    );
    if (remainingSlots <= 0) continue;
    needs.push({
      subscriptionId: sub.id as string,
      userId: sub.user_id as string,
      realName: profile.realName,
      targetMonth: periodMap.get(sub.period_id as string) ?? "",
      selectedCount,
      requiredCount,
      remainingSlots,
    });
  }

  return needs.sort((a, b) => {
    if (a.targetMonth !== b.targetMonth) return a.targetMonth.localeCompare(b.targetMonth, "ko");
    return a.realName.localeCompare(b.realName, "ko");
  });
}
