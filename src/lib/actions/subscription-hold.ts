"use server";

import {
  createClient,
  createPublicClient,
  getAuthUser,
} from "@/lib/supabase/server";
import { revalidatePath, unstable_cache } from "next/cache";
import {
  HOLD_DURATION_OPTIONS,
  applyHoldShiftToSortedDates,
  computeHoldExclusiveEnd,
  computeHoldShiftDays,
  datesToWeeklySelections,
  findHoldAnchorDate,
  inverseHoldShiftFromSortedDates,
  parseSubscriptionHoldAllowedKindsSetting,
  todayKstIso,
} from "@/lib/subscription-hold";
import { expandDeliveryDaysToDateStrings } from "@/lib/delivery-days";
import {
  bulkSaveDeliveryDays,
  validateDeliveryDateStringsForSubscription,
} from "@/lib/actions/delivery";
import type { ActionResult } from "@/types";
import type { SubscriptionHold, SubscriptionHoldDurationKind } from "@/types";

function revalidateHoldRelatedPaths() {
  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/subscription-holds");
}

function sliceDate(d: string | null | undefined): string | null {
  if (!d) return null;
  return d.slice(0, 10);
}

function periodFromSubscriptionRow(row: {
  subscription_periods?: unknown;
}): { delivery_start: string | null; delivery_end: string | null } | null {
  const p = row.subscription_periods;
  if (!p) return null;
  type Period = { delivery_start: string | null; delivery_end: string | null };
  if (Array.isArray(p)) return (p[0] as Period) ?? null;
  return p as Period;
}

function validateWeeklySelectionsFrequency(
  subscription: {
    frequency_per_week: number;
    total_delivery_days: number | null;
  },
  weeklySelections: { weekStart: string; selectedDays: number[] }[]
): string | undefined {
  for (const { selectedDays } of weeklySelections) {
    if (selectedDays.some((d) => d < 1 || d > 5)) {
      return "월~금만 선택 가능합니다";
    }
    if (
      !subscription.total_delivery_days &&
      selectedDays.length > subscription.frequency_per_week
    ) {
      return `최대 ${subscription.frequency_per_week}일까지 선택할 수 있습니다`;
    }
  }
  return undefined;
}

// Hold settings are global admin config; cache them across requests like the
// menu cutoff. Mutations bust the shared "settings" tag.
const fetchHoldSettingsCached = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("admin_settings")
      .select("key, value")
      .in("key", [
        "subscription_hold_master_enabled",
        "subscription_hold_allowed_duration_kinds",
      ]);

    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[(row as { key: string }).key] = (row as { value: string }).value;
    }
    return map;
  },
  ["subscription-hold-settings"],
  { revalidate: 600, tags: ["settings"] }
);

async function fetchHoldFeatureFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{
  masterEnabled: boolean;
  userEligible: boolean;
  allowedKinds: SubscriptionHoldDurationKind[];
}> {
  const [profRes, map] = await Promise.all([
    supabase
      .from("profiles")
      .select("subscription_hold_eligible")
      .eq("id", userId)
      .maybeSingle(),
    fetchHoldSettingsCached(),
  ]);

  const prof = profRes.data as
    | { subscription_hold_eligible?: boolean | null }
    | null;

  return {
    masterEnabled: map.subscription_hold_master_enabled === "true",
    userEligible: !!prof?.subscription_hold_eligible,
    allowedKinds: parseSubscriptionHoldAllowedKindsSetting(
      map.subscription_hold_allowed_duration_kinds
    ),
  };
}

/**
 * Whether the signed-in user may request or change hold duration (not cancel).
 * Cancel remains allowed when a hold row exists; see subscription UI surface rules.
 */
export async function getSubscriptionHoldUiAccess(): Promise<{
  mayMutateHold: boolean;
  allowedDurationKinds: SubscriptionHoldDurationKind[];
}> {
  const user = await getAuthUser();
  if (!user) {
    return {
      mayMutateHold: false,
      allowedDurationKinds: HOLD_DURATION_OPTIONS.map((o) => o.kind),
    };
  }
  const supabase = await createClient();
  const flags = await fetchHoldFeatureFlags(supabase, user.id);
  return {
    mayMutateHold: flags.masterEnabled && flags.userEligible,
    allowedDurationKinds: flags.allowedKinds,
  };
}

export async function getOpenSubscriptionHold(
  subscriptionId: string
): Promise<SubscriptionHold | null> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;

  const { data } = await supabase
    .from("subscription_holds")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .in("status", ["scheduled", "active"])
    .maybeSingle();

  if (!data) return null;
  const row = data as { user_id: string };
  if (row.user_id !== user.id) return null;
  return data as SubscriptionHold;
}

export async function requestSubscriptionHold(
  subscriptionId: string,
  durationKind: SubscriptionHoldDurationKind
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const flags = await fetchHoldFeatureFlags(supabase, user.id);
  if (!flags.masterEnabled || !flags.userEligible) {
    return { error: "홀드 기능을 사용할 수 없습니다" };
  }
  if (!flags.allowedKinds.includes(durationKind)) {
    return { error: "선택한 홀드 기간은 현재 사용할 수 없습니다" };
  }

  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, frequency_per_week, total_delivery_days, hold_billing_extension_days, subscription_periods(delivery_start, delivery_end)"
    )
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (subErr || !subRow) return { error: "구독을 찾을 수 없습니다" };

  const period = periodFromSubscriptionRow(subRow);
  const deliveryStart = sliceDate(period?.delivery_start ?? null);
  const deliveryEnd = sliceDate(period?.delivery_end ?? null);

  const { data: existingHold } = await supabase
    .from("subscription_holds")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .in("status", ["scheduled", "active"])
    .maybeSingle();

  if (existingHold) {
    return { error: "이미 진행 중인 배송 홀드가 있어요" };
  }

  const { data: deliveryRows } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id);

  const sortedDates = [...expandDeliveryDaysToDateStrings(deliveryRows ?? [])].sort();
  const todayStr = todayKstIso();
  const anchor = findHoldAnchorDate({
    todayKstIso: todayStr,
    deliveryIsoDatesSorted: sortedDates,
    deliveryStart,
    deliveryEnd,
  });

  if (!anchor) {
    return {
      error:
        "홀드 시작 기준일을 정할 수 없어요. 배송일을 먼저 선택하거나 배송 기간을 확인해 주세요.",
    };
  }

  const endExclusive = computeHoldExclusiveEnd(anchor, durationKind);
  const L = computeHoldShiftDays(anchor, endExclusive);
  const newDates = applyHoldShiftToSortedDates(sortedDates, anchor, L);
  const weeklySelections = datesToWeeklySelections(newDates);

  const freqErr = validateWeeklySelectionsFrequency(
    {
      frequency_per_week: subRow.frequency_per_week,
      total_delivery_days: subRow.total_delivery_days,
    },
    weeklySelections
  );
  if (freqErr) return { error: freqErr };

  const dateVal = await validateDeliveryDateStringsForSubscription(
    supabase,
    newDates
  );
  if (dateVal.error) return { error: dateVal.error };

  const prevExt = subRow.hold_billing_extension_days ?? 0;
  const nextExt = prevExt + L;

  const { data: inserted, error: insertErr } = await supabase
    .from("subscription_holds")
    .insert({
      subscription_id: subscriptionId,
      status: "scheduled",
      start_date: anchor,
      end_date: endExclusive,
      duration_kind: durationKind,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { error: insertErr?.message ?? "홀드를 저장하지 못했습니다" };
  }

  const holdId = (inserted as { id: string }).id;

  const { error: extErr } = await supabase
    .from("subscriptions")
    .update({ hold_billing_extension_days: nextExt })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (extErr) {
    await supabase.from("subscription_holds").delete().eq("id", holdId);
    return { error: extErr.message };
  }

  const saveResult = await bulkSaveDeliveryDays(subscriptionId, weeklySelections);
  if (saveResult.error) {
    await supabase.from("subscription_holds").delete().eq("id", holdId);
    await supabase
      .from("subscriptions")
      .update({ hold_billing_extension_days: prevExt })
      .eq("id", subscriptionId)
      .eq("user_id", user.id);
    return { error: saveResult.error };
  }

  revalidateHoldRelatedPaths();
  return { success: true };
}

export async function updateSubscriptionHoldDuration(
  subscriptionId: string,
  durationKind: SubscriptionHoldDurationKind
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: hold, error: holdErr } = await supabase
    .from("subscription_holds")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .in("status", ["scheduled", "active"])
    .maybeSingle();

  if (holdErr || !hold) {
    return { error: "변경할 홀드를 찾을 수 없습니다" };
  }

  const holdRow = hold as SubscriptionHold;
  if (holdRow.duration_kind === durationKind) {
    return { success: true };
  }

  const flags = await fetchHoldFeatureFlags(supabase, user.id);
  if (!flags.masterEnabled || !flags.userEligible) {
    return { error: "홀드 기능을 사용할 수 없습니다" };
  }
  if (!flags.allowedKinds.includes(durationKind)) {
    return { error: "선택한 홀드 기간은 현재 사용할 수 없습니다" };
  }

  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, frequency_per_week, total_delivery_days, hold_billing_extension_days"
    )
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (subErr || !subRow) return { error: "구독을 찾을 수 없습니다" };

  const { data: deliveryRows } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id);

  const currentSorted = [
    ...expandDeliveryDaysToDateStrings(deliveryRows ?? []),
  ].sort();

  const start = holdRow.start_date.slice(0, 10);
  const oldL = computeHoldShiftDays(
    holdRow.start_date.slice(0, 10),
    holdRow.end_date.slice(0, 10)
  );
  const baseDates = inverseHoldShiftFromSortedDates(
    currentSorted,
    start,
    oldL
  );
  const newEndExclusive = computeHoldExclusiveEnd(start, durationKind);
  const newL = computeHoldShiftDays(start, newEndExclusive);
  const newDates = applyHoldShiftToSortedDates(baseDates, start, newL);
  const weeklySelections = datesToWeeklySelections(newDates);

  const freqErr = validateWeeklySelectionsFrequency(
    {
      frequency_per_week: subRow.frequency_per_week,
      total_delivery_days: subRow.total_delivery_days,
    },
    weeklySelections
  );
  if (freqErr) return { error: freqErr };

  const dateVal = await validateDeliveryDateStringsForSubscription(
    supabase,
    newDates
  );
  if (dateVal.error) return { error: dateVal.error };

  const prevExt = subRow.hold_billing_extension_days ?? 0;
  const delta = newL - oldL;
  const nextExt = Math.max(0, prevExt + delta);

  const saveResult = await bulkSaveDeliveryDays(subscriptionId, weeklySelections);
  if (saveResult.error) return { error: saveResult.error };

  const { error: updHoldErr } = await supabase
    .from("subscription_holds")
    .update({
      duration_kind: durationKind,
      end_date: newEndExclusive,
    })
    .eq("id", holdRow.id)
    .eq("subscription_id", subscriptionId);

  if (updHoldErr) {
    return { error: updHoldErr.message };
  }

  const { error: updExtErr } = await supabase
    .from("subscriptions")
    .update({ hold_billing_extension_days: nextExt })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (updExtErr) return { error: updExtErr.message };

  revalidateHoldRelatedPaths();
  return { success: true };
}

export async function cancelSubscriptionHold(
  subscriptionId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: hold, error: holdErr } = await supabase
    .from("subscription_holds")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .in("status", ["scheduled", "active"])
    .maybeSingle();

  if (holdErr || !hold) {
    return { error: "취소할 홀드가 없습니다" };
  }

  const holdRow = hold as SubscriptionHold;
  const start = holdRow.start_date.slice(0, 10);
  const L = computeHoldShiftDays(
    holdRow.start_date.slice(0, 10),
    holdRow.end_date.slice(0, 10)
  );

  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .select("id, hold_billing_extension_days")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (subErr || !subRow) return { error: "구독을 찾을 수 없습니다" };

  const { data: deliveryRows } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id);

  const currentSorted = [
    ...expandDeliveryDaysToDateStrings(deliveryRows ?? []),
  ].sort();

  const reverted = inverseHoldShiftFromSortedDates(currentSorted, start, L);
  const weeklySelections = datesToWeeklySelections(reverted);

  const { data: fullSub } = await supabase
    .from("subscriptions")
    .select("frequency_per_week, total_delivery_days")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!fullSub) return { error: "구독을 찾을 수 없습니다" };

  const freqErr = validateWeeklySelectionsFrequency(
    {
      frequency_per_week: fullSub.frequency_per_week,
      total_delivery_days: fullSub.total_delivery_days,
    },
    weeklySelections
  );
  if (freqErr) return { error: freqErr };

  const dateVal = await validateDeliveryDateStringsForSubscription(
    supabase,
    reverted
  );
  if (dateVal.error) return { error: dateVal.error };

  const saveResult = await bulkSaveDeliveryDays(subscriptionId, weeklySelections);
  if (saveResult.error) return { error: saveResult.error };

  const prevExt = subRow.hold_billing_extension_days ?? 0;
  const nextExt = Math.max(0, prevExt - L);

  const { error: updHoldErr } = await supabase
    .from("subscription_holds")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", holdRow.id)
    .eq("subscription_id", subscriptionId);

  if (updHoldErr) return { error: updHoldErr.message };

  const { error: updExtErr } = await supabase
    .from("subscriptions")
    .update({ hold_billing_extension_days: nextExt })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (updExtErr) return { error: updExtErr.message };

  revalidateHoldRelatedPaths();
  return { success: true };
}
