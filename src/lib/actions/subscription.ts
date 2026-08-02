"use server";

import { cache as reactCache } from "react";
import {
  createClient,
  createAdminClient,
  createPublicClient,
  getAuthUser,
  getAuthUserId,
} from "@/lib/supabase/server";
import { revalidatePath, updateTag, unstable_cache } from "next/cache";
import { getKSTDate, formatDateISO } from "@/lib/utils";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { bulkSaveDeliveryDays, validateDeliveryDateStringsForSubscription } from "@/lib/actions/delivery";
import {
  finalizeCompensationCreditsOnPayment,
  reserveCompensationCreditsForSubscription,
  selectCompensationCreditIdsForDays,
} from "@/lib/actions/compensation-credits";
import {
  notifyAdminsOfDeliveryPostpone,
  notifyAdminsOfDeliveryReschedule,
} from "@/lib/actions/admin-notifications";
import type {
  ActionResult,
  SubscriptionPeriod,
  Subscription,
  PaymentMethod,
  DeliveryDay,
  SubscriptionHold,
} from "@/types";

function revalidateAfterDeliveryScheduleChange(userId?: string): void {
  updateTag("day-counts");
  revalidatePath("/");
  revalidatePath("/my");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  if (userId) revalidatePath(`/admin/users/${userId}`);
}

// ─── Subscription Periods (Admin) ────────────────────────────

// Periods are global config rows; admin mutations below bust the tag.
const fetchSubscriptionPeriodsCached = unstable_cache(
  async (): Promise<SubscriptionPeriod[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("subscription_periods")
      .select("*")
      .order("apply_start", { ascending: false });
    return (data as SubscriptionPeriod[]) ?? [];
  },
  ["subscription-periods"],
  { revalidate: 600, tags: ["periods"] }
);

export async function getSubscriptionPeriods(): Promise<SubscriptionPeriod[]> {
  return fetchSubscriptionPeriodsCached();
}

// The resolvers below derive answers from the cached periods list instead of
// issuing dedicated queries — the table is tiny and the cache is busted by
// every period mutation, so results stay correct.

export async function getSubscriptionPeriodById(
  periodId: string
): Promise<SubscriptionPeriod | null> {
  const periods = await fetchSubscriptionPeriodsCached();
  return periods.find((p) => p.id === periodId) ?? null;
}

export async function getActivePeriod(): Promise<SubscriptionPeriod | null> {
  const periods = await fetchSubscriptionPeriodsCached();
  const kstNow = getKSTDate();
  const todayDate = formatDateISO(kstNow);

  // Prefer the latest period whose apply window contains "now".
  const applyPeriod = periods
    .filter(
      (p) =>
        p.apply_start &&
        p.pay_end &&
        new Date(p.apply_start) <= kstNow &&
        new Date(p.pay_end) >= kstNow
    )
    .sort((a, b) => (b.apply_start ?? "").localeCompare(a.apply_start ?? ""))[0];
  if (applyPeriod) return applyPeriod;

  // Fall back to the period currently being delivered.
  const deliveryPeriod = periods
    .filter(
      (p) =>
        p.delivery_start &&
        p.delivery_end &&
        p.delivery_start.slice(0, 10) <= todayDate &&
        p.delivery_end.slice(0, 10) >= todayDate
    )
    .sort((a, b) =>
      (b.delivery_start ?? "").localeCompare(a.delivery_start ?? "")
    )[0];

  return deliveryPeriod ?? null;
}

/**
 * Returns the earliest future (or currently-applying) period that a new subscriber
 * can apply for. Used as a fallback when the active period is already past pay_end
 * and the user has no existing subscription for it.
 */
export async function getNextApplicablePeriod(
  afterPeriodId: string
): Promise<SubscriptionPeriod | null> {
  const periods = await fetchSubscriptionPeriodsCached();
  const kstNow = getKSTDate();

  return (
    periods
      .filter(
        (p) =>
          p.id !== afterPeriodId && p.pay_end && new Date(p.pay_end) > kstNow
      )
      .sort((a, b) => (a.apply_start ?? "").localeCompare(b.apply_start ?? ""))[0] ??
    null
  );
}

export async function createSubscriptionPeriod(
  period: Omit<SubscriptionPeriod, "id" | "created_at" | "updated_at">
): Promise<ActionResult & { id?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subscription_periods")
    .insert(period)
    .select("id")
    .single();

  if (error) return { error: error.message };

  updateTag("periods");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/subscription-status");
  return { success: true, id: data.id as string };
}

export async function updateSubscriptionPeriod(
  id: string,
  period: Partial<Omit<SubscriptionPeriod, "id" | "created_at" | "updated_at">>
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("subscription_periods")
    .update(period)
    .eq("id", id);

  if (error) return { error: error.message };

  updateTag("periods");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}

export async function deleteSubscriptionPeriod(
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("subscription_periods")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  updateTag("periods");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}

// ─── Cancel Subscription ─────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: current } = await supabase
    .from("subscriptions")
    .select("carryover_from_subscription_id")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  if (current?.carryover_from_subscription_id) {
    await supabase
      .from("subscriptions")
      .update({ closure_reselection_required: true })
      .eq("id", current.carryover_from_subscription_id)
      .eq("user_id", user.id);
  }

  await supabase
    .from("delivery_days")
    .delete()
    .eq("subscription_id", subscriptionId);

  updateTag("day-counts");
  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}

// ─── User Subscriptions ──────────────────────────────────────

// Request-scoped dedupe: the subscription page can ask for the same
// (user, period) row twice (closed-period fallback + main batch).
const getMySubscriptionCached = reactCache(
  async (periodId: string): Promise<Subscription | null> => {
    const supabase = await createClient();
    const user = await getAuthUser();

    if (!user) return null;

    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("period_id", periodId)
      .single();

    return (data as Subscription) ?? null;
  }
);

export async function getMySubscription(
  periodId: string
): Promise<Subscription | null> {
  return getMySubscriptionCached(periodId);
}

export type SubscriptionBundle = {
  subscription: Subscription | null;
  deliveryDays: DeliveryDay[];
  openHold: SubscriptionHold | null;
};

// Single joined query replacing three sequential lookups on the subscription
// page (subscription row → delivery days → open hold). Request-scoped cache
// so the closed-period fallback and the main render share one round trip.
const getMySubscriptionBundleCached = reactCache(
  async (periodId: string): Promise<SubscriptionBundle> => {
    const empty: SubscriptionBundle = {
      subscription: null,
      deliveryDays: [],
      openHold: null,
    };

    const supabase = await createClient();
    const user = await getAuthUser();
    if (!user) return empty;

    const { data } = await supabase
      .from("subscriptions")
      .select("*, delivery_days(*), subscription_holds(*)")
      .eq("user_id", user.id)
      .eq("period_id", periodId)
      .in("subscription_holds.status", ["scheduled", "active"])
      .maybeSingle();

    if (!data) return empty;

    const {
      delivery_days: deliveryDayRows,
      subscription_holds: holdRows,
      ...subscription
    } = data as Subscription & {
      delivery_days: DeliveryDay[] | null;
      subscription_holds: SubscriptionHold[] | null;
    };

    const deliveryDays = [...(deliveryDayRows ?? [])].sort((a, b) =>
      a.week_start.localeCompare(b.week_start)
    );
    const openHold =
      (holdRows ?? []).find((h) => h.user_id === user.id) ?? null;

    return { subscription: subscription as Subscription, deliveryDays, openHold };
  }
);

export async function getMySubscriptionBundle(
  periodId: string
): Promise<SubscriptionBundle> {
  return getMySubscriptionBundleCached(periodId);
}

export async function getMyLatestSubscription(): Promise<Subscription | null> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("*, subscription_periods(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (data as Subscription) ?? null;
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("subscriptions")
    .select("*, subscription_periods(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as Subscription[]) ?? [];
}

export async function getMyLastPaymentMethod(): Promise<string | null> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("payment_method")
    .eq("user_id", user.id)
    .not("payment_method", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.payment_method ?? null;
}

export type CarryoverReplacement = {
  sourceSubscriptionId: string;
  availableDays: number;
  targetMonth: string;
  usedDates: string[];
  /** Pending compensation credit rows (for selecting which IDs to consume). */
  compensationCredits: { id: string; days: number }[];
  /** @deprecated Use compensationCredits; kept for callers not yet updated. */
  compensationCreditIds: string[];
};

type PendingCompensationCredit = {
  id: string;
  days: number;
  source_subscription_id: string | null;
};

async function fetchPendingCompensationCredits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  currentSubscriptionId?: string
): Promise<PendingCompensationCredit[]> {
  let query = supabase
    .from("compensation_credits")
    .select("id, days, source_subscription_id")
    .eq("user_id", userId)
    .is("applied_at", null)
    .order("created_at", { ascending: true });

  if (currentSubscriptionId) {
    query = query.or(
      `applied_to_subscription_id.is.null,applied_to_subscription_id.eq.${currentSubscriptionId}`
    );
  } else {
    query = query.is("applied_to_subscription_id", null);
  }

  const { data } = await query;
  return (data ?? []) as PendingCompensationCredit[];
}

/**
 * Store-closure credits tied to a source subscription overlap with that
 * subscription's carryover "remaining" when remaining > 0. Only credits from
 * other sources (e.g. vacation skip) should stack on top.
 */
function additionalCreditDaysForCarryover(
  unresolvedAvailableDays: number,
  sourceSubscriptionId: string,
  credits: PendingCompensationCredit[]
): number {
  return credits.reduce((sum, credit) => {
    if (
      credit.source_subscription_id === sourceSubscriptionId &&
      unresolvedAvailableDays > 0
    ) {
      return sum;
    }
    return sum + credit.days;
  }, 0);
}

type SubscriptionWithPeriod = {
  id: string;
  user_id: string;
  period_id: string;
  frequency_per_week: number | null;
  total_delivery_days: number | null;
  payment_status: string | null;
  closure_reselection_required: boolean | null;
  subscription_periods: {
    target_month: string;
    delivery_start: string | null;
    delivery_end: string | null;
  } | null;
};

type CarryoverUsageRow = {
  id: string;
  carryover_delivery_days: number | null;
};

type ExistingCarryoverSubscription = CarryoverUsageRow & {
  carryover_from_subscription_id: string | null;
};

function getEffectiveTotalDays(
  subscription: Pick<
    SubscriptionWithPeriod,
    "frequency_per_week" | "total_delivery_days"
  >
): number {
  return (
    (subscription.total_delivery_days ?? 0) ||
    ((subscription.frequency_per_week ?? 0) * 4)
  );
}

function countSelectedDays(
  rows: { selected_days: number[] | null }[] | null | undefined
): number {
  return (rows ?? []).reduce(
    (sum, row) => sum + ((row.selected_days ?? []).length),
    0
  );
}

function expandDeliveryRowsToDateStrings(
  rows: { week_start: string; selected_days: number[] | null }[] | null | undefined
): string[] {
  const dates: string[] = [];
  for (const row of rows ?? []) {
    const weekStart = new Date(row.week_start + "T00:00:00");
    for (const dayOfWeek of row.selected_days ?? []) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayOfWeek - 1);
      dates.push(formatDateISO(date));
    }
  }
  return dates.sort();
}

async function getUnresolvedCarryoverReplacement(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  targetPeriodId: string,
  excludeSubscriptionId?: string
): Promise<CarryoverReplacement | null> {
  // Periods are already cached process-wide — no need for a dedicated query.
  const targetPeriod = await getSubscriptionPeriodById(targetPeriodId);
  if (!targetPeriod?.delivery_start || !targetPeriod.delivery_end) return null;

  // Store closures are cached too; overlap checks run in memory below instead
  // of one query per candidate subscription.
  const [{ data: subs }, allClosures] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, user_id, period_id, frequency_per_week, total_delivery_days, payment_status, closure_reselection_required, subscription_periods(target_month, delivery_start, delivery_end)"
      )
      .eq("user_id", userId)
      .eq("payment_status", "completed"),
    getStoreClosures(),
  ]);

  const candidates = ((subs ?? []) as unknown as SubscriptionWithPeriod[])
    .filter((sub) => {
      const deliveryStart = sub.subscription_periods?.delivery_start;
      return (
        sub.id !== excludeSubscriptionId &&
        sub.period_id !== targetPeriodId &&
        !!deliveryStart &&
        deliveryStart < targetPeriod.delivery_start!
      );
    })
    .sort((a, b) =>
      (b.subscription_periods?.delivery_start ?? "").localeCompare(
        a.subscription_periods?.delivery_start ?? ""
      )
    );

  if (candidates.length === 0) return null;

  // One batched round trip for all candidates instead of 2-3 queries each.
  const candidateIds = candidates.map((c) => c.id);
  const [{ data: allDeliveryRows }, { data: allUsedRows }] = await Promise.all([
    supabase
      .from("delivery_days")
      .select("subscription_id, week_start, selected_days")
      .in("subscription_id", candidateIds),
    supabase
      .from("subscriptions")
      .select("id, carryover_delivery_days, carryover_from_subscription_id")
      .eq("user_id", userId)
      .in("carryover_from_subscription_id", candidateIds),
  ]);

  const deliveryRowsBySub = new Map<
    string,
    { week_start: string; selected_days: number[] | null }[]
  >();
  for (const row of (allDeliveryRows ?? []) as {
    subscription_id: string;
    week_start: string;
    selected_days: number[] | null;
  }[]) {
    const rows = deliveryRowsBySub.get(row.subscription_id) ?? [];
    rows.push(row);
    deliveryRowsBySub.set(row.subscription_id, rows);
  }

  const usedRowsBySub = new Map<string, CarryoverUsageRow[]>();
  for (const row of (allUsedRows ?? []) as (CarryoverUsageRow & {
    carryover_from_subscription_id: string | null;
  })[]) {
    if (!row.carryover_from_subscription_id) continue;
    const rows = usedRowsBySub.get(row.carryover_from_subscription_id) ?? [];
    rows.push(row);
    usedRowsBySub.set(row.carryover_from_subscription_id, rows);
  }

  const closureDates = allClosures.map((c) => c.closure_date.slice(0, 10));

  for (const sub of candidates) {
    const deliveryDates = expandDeliveryRowsToDateStrings(
      deliveryRowsBySub.get(sub.id) ?? []
    );
    const selectedCount = deliveryDates.length;
    const usedDates = deliveryDates.filter(
      (date) =>
        date >= targetPeriod.delivery_start! &&
        date <= targetPeriod.delivery_end!
    );
    const remaining = Math.max(0, getEffectiveTotalDays(sub) - selectedCount);

    const usedByOtherSubscriptions = (usedRowsBySub.get(sub.id) ?? [])
      .filter((row) => row.id !== excludeSubscriptionId)
      .reduce(
        (sum, row) => sum + (row.carryover_delivery_days ?? 0),
        0
      );
    const available = Math.max(0, remaining - usedByOtherSubscriptions);
    if (available <= 0 && usedDates.length === 0) continue;

    const sourcePeriod = sub.subscription_periods;
    const sourceStart = sourcePeriod?.delivery_start?.slice(0, 10);
    const sourceEnd = sourcePeriod?.delivery_end?.slice(0, 10);
    const hasClosure =
      !!sourceStart &&
      !!sourceEnd &&
      closureDates.some((d) => d >= sourceStart && d <= sourceEnd);
    const isClosureReplacement =
      sub.closure_reselection_required === true || (hasClosure && selectedCount > 0);
    if (!isClosureReplacement) continue;

    return {
      sourceSubscriptionId: sub.id,
      availableDays: available,
      targetMonth: sourcePeriod?.target_month ?? "",
      usedDates,
      compensationCreditIds: [],
      compensationCredits: [],
    };
  }

  return null;
}

export async function getMyCarryoverReplacement(
  periodId: string
): Promise<CarryoverReplacement | null> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, carryover_delivery_days, carryover_from_subscription_id")
    .eq("user_id", user.id)
    .eq("period_id", periodId)
    .maybeSingle();

  const [unresolved, creditRows] = await Promise.all([
    getUnresolvedCarryoverReplacement(
      supabase,
      user.id,
      periodId,
      existing?.id as string | undefined
    ),
    fetchPendingCompensationCredits(
      supabase,
      user.id,
      existing?.id as string | undefined
    ),
  ]);

  const totalCreditDays = creditRows.reduce((sum, r) => sum + r.days, 0);
  const creditIds = creditRows.map((r) => r.id);

  if (unresolved) {
    const extraCreditDays = additionalCreditDaysForCarryover(
      unresolved.availableDays,
      unresolved.sourceSubscriptionId,
      creditRows
    );
    return {
      ...unresolved,
      availableDays: unresolved.availableDays + extraCreditDays,
      compensationCredits: creditRows,
      compensationCreditIds: creditIds,
    };
  }

  // If only compensation credits exist (no store-closure carryover)
  if (totalCreditDays > 0) {
    return {
      sourceSubscriptionId: "",
      availableDays: totalCreditDays,
      targetMonth: "",
      usedDates: [],
      compensationCredits: creditRows,
      compensationCreditIds: creditIds,
    };
  }

  // Fallback: source period is fully resolved, but this subscription already
  // has its allocation stored — return it so the edit form can still show and
  // save the compensation correctly.
  if (
    existing?.carryover_from_subscription_id &&
    ((existing.carryover_delivery_days as number | null) ?? 0) > 0
  ) {
    return {
      sourceSubscriptionId: existing.carryover_from_subscription_id as string,
      availableDays: (existing.carryover_delivery_days as number | null) ?? 0,
      targetMonth: "",
      usedDates: [],
      compensationCredits: creditRows,
      compensationCreditIds: creditIds,
    };
  }

  return null;
}

export async function createOrUpdateSubscription(
  periodId: string,
  frequency: number,
  saladsPerDelivery: number,
  totalDeliveryDays?: number,
  carryoverDeliveryDays = 0,
  carryoverFromSubscriptionId?: string | null,
  compensationCreditDaysUsed = 0
): Promise<ActionResult & { subscriptionId?: string }> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: period } = await supabase
    .from("subscription_periods")
    .select("*")
    .eq("id", periodId)
    .single();

  if (!period) return { error: "Subscription period not found" };

  const now = getKSTDate();
  const payEnd = new Date(period.pay_end);

  if (now > payEnd) {
    return { error: "PERIOD_CLOSED" };
  }

  const normalizedCarryoverDays = Math.max(0, carryoverDeliveryDays);
  const normalizedCarryoverFromId = carryoverFromSubscriptionId || null;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, carryover_delivery_days, carryover_from_subscription_id")
    .eq("user_id", user.id)
    .eq("period_id", periodId)
    .single();
  const existingCarryover = existing as ExistingCarryoverSubscription | null;

  if (normalizedCarryoverDays > 0) {
    // Compensation-credits-only path: carryoverFromSubscriptionId is "" (empty)
    // but the user has pending compensation credits covering the days.
    const isCompensationOnly =
      !normalizedCarryoverFromId && compensationCreditDaysUsed > 0;

    if (!normalizedCarryoverFromId && !isCompensationOnly) {
      return { error: "사용할 수 있는 휴무 보상일이 없습니다" };
    }

    if (isCompensationOnly) {
      const pendingCredits = await fetchPendingCompensationCredits(
        supabase,
        user.id,
        existingCarryover?.id
      );
      const totalCreditDays = pendingCredits.reduce(
        (sum, row) => sum + row.days,
        0
      );
      if (normalizedCarryoverDays > totalCreditDays) {
        return { error: "사용할 수 있는 휴무 보상일이 부족합니다" };
      }
    } else {
      const existingCarryoverDays =
        existingCarryover?.carryover_delivery_days ?? 0;
      const isAlreadyStoredCarryover =
        existingCarryover?.carryover_from_subscription_id ===
          normalizedCarryoverFromId &&
        normalizedCarryoverDays <= existingCarryoverDays;

      if (!isAlreadyStoredCarryover) {
        const [availableCarryover, pendingCredits] = await Promise.all([
          getUnresolvedCarryoverReplacement(
            supabase,
            user.id,
            periodId,
            existingCarryover?.id
          ),
          fetchPendingCompensationCredits(
            supabase,
            user.id,
            existingCarryover?.id
          ),
        ]);

        const extraCreditDays = availableCarryover
          ? additionalCreditDaysForCarryover(
              availableCarryover.availableDays,
              availableCarryover.sourceSubscriptionId,
              pendingCredits
            )
          : 0;

        // Total entitlement = days still claimable (availableDays) + days already
        // pre-selected for this period (usedDates) + credits from other sources.
        // A user whose pre-selected dates fill their entire entitlement will have
        // availableDays = 0 but usedDates.length > 0, so we must include both in
        // the cap. Same-source closure credits stack only when remaining is 0.
        const totalEntitlement = availableCarryover
          ? availableCarryover.availableDays +
            extraCreditDays +
            (availableCarryover.usedDates?.length ?? 0)
          : 0;
        if (
          !availableCarryover ||
          availableCarryover.sourceSubscriptionId !== normalizedCarryoverFromId ||
          normalizedCarryoverDays > totalEntitlement
        ) {
          return { error: "사용할 수 있는 휴무 보상일이 부족합니다" };
        }
      }
    }
  }

  if (existing) {
    const updateData: Record<string, unknown> = {
      frequency_per_week: frequency,
      salads_per_delivery: saladsPerDelivery,
      payment_method: null,
      payment_status: "pending",
      carryover_delivery_days: normalizedCarryoverDays,
      carryover_from_subscription_id:
        normalizedCarryoverDays > 0 ? normalizedCarryoverFromId : null,
    };
    if (totalDeliveryDays !== undefined) {
      updateData.total_delivery_days = totalDeliveryDays;
    }

    const { error } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("id", existing.id);

    if (error) return { error: error.message };

    if (
      normalizedCarryoverDays === 0 &&
      existingCarryover?.carryover_from_subscription_id
    ) {
      await supabase
        .from("subscriptions")
        .update({ closure_reselection_required: true })
        .eq("id", existingCarryover.carryover_from_subscription_id)
        .eq("user_id", user.id);
    }

    const creditIdsToReserve = await selectCompensationCreditIdsForDays(
      user.id,
      compensationCreditDaysUsed,
      existing.id
    );
    await reserveCompensationCreditsForSubscription(
      user.id,
      existing.id,
      creditIdsToReserve
    );

    revalidatePath("/subscription");
    revalidatePath("/delivery");
    revalidatePath("/");
    revalidatePath("/admin/subscription-status");
    revalidatePath("/admin/compensation");
    return { success: true, subscriptionId: existing.id };
  } else {
    const { data: inserted, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        period_id: periodId,
        frequency_per_week: frequency,
        salads_per_delivery: saladsPerDelivery,
        total_delivery_days: totalDeliveryDays ?? null,
        carryover_delivery_days: normalizedCarryoverDays,
        carryover_from_subscription_id:
          normalizedCarryoverDays > 0 && normalizedCarryoverFromId
            ? normalizedCarryoverFromId
            : null,
        payment_status: "pending",
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    const creditIdsToReserve = await selectCompensationCreditIdsForDays(
      user.id,
      compensationCreditDaysUsed,
      inserted.id
    );
    await reserveCompensationCreditsForSubscription(
      user.id,
      inserted.id,
      creditIdsToReserve
    );

    revalidatePath("/subscription");
    revalidatePath("/delivery");
    revalidatePath("/");
    revalidatePath("/admin/subscription-status");
    revalidatePath("/admin/compensation");
    return { success: true, subscriptionId: inserted.id };
  }
}

export async function resolveCarryoverReplacement(
  subscriptionId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("carryover_delivery_days, carryover_from_subscription_id")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .maybeSingle();

  const sourceId = sub?.carryover_from_subscription_id as string | null;
  const carryoverDays = (sub?.carryover_delivery_days as number | null) ?? 0;
  if (!sourceId || carryoverDays <= 0) return { success: true };

  const [{ data: sourceSub }, { data: sourceDeliveryRows }, { data: usedRows }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("frequency_per_week, total_delivery_days")
        .eq("id", sourceId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("delivery_days")
        .select("selected_days")
        .eq("subscription_id", sourceId),
      supabase
        .from("subscriptions")
        .select("carryover_delivery_days")
        .eq("user_id", user.id)
        .eq("carryover_from_subscription_id", sourceId),
    ]);

  if (!sourceSub) return { success: true };

  const requiredCount = getEffectiveTotalDays({
    frequency_per_week: (sourceSub.frequency_per_week as number | null) ?? 0,
    total_delivery_days: sourceSub.total_delivery_days as number | null,
  });
  const selectedCount = countSelectedDays(
    sourceDeliveryRows as { selected_days: number[] | null }[] | null
  );
  const usedCarryoverCount = ((usedRows ?? []) as {
    carryover_delivery_days: number | null;
  }[]).reduce((sum, row) => sum + (row.carryover_delivery_days ?? 0), 0);
  const stillNeedsReplacement =
    Math.max(0, requiredCount - selectedCount - usedCarryoverCount) > 0;

  const { error } = await supabase
    .from("subscriptions")
    .update({ closure_reselection_required: stillNeedsReplacement })
    .eq("id", sourceId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}

/**
 * One-shot subscription apply: create/update the subscription row, sync
 * delivery days, and resolve carryover in a single server request.
 *
 * Replaces the previous client flow of three sequential server-action POSTs
 * (createOrUpdateSubscription → bulkSaveDeliveryDays →
 * resolveCarryoverReplacement), each of which paid its own network and auth
 * overhead. Within one request, the Supabase client and auth user lookups are
 * request-scoped-cached, so they only happen once.
 */
export async function applySubscriptionPlan(input: {
  periodId: string;
  frequency: number;
  saladsPerDelivery: number;
  paidDeliveryDays?: number;
  carryoverDaysUsed?: number;
  carryoverFromSubscriptionId?: string | null;
  /** How many of carryoverDaysUsed come from compensation_credits (not closure carryover). */
  compensationCreditDaysUsed?: number;
  weeklySelections: { weekStart: string; selectedDays: number[] }[];
}): Promise<
  ActionResult & {
    subscriptionId?: string;
    /** Which step failed, so the client can show a matching message. */
    stage?: "subscription" | "deliveryDays" | "carryover";
  }
> {
  const {
    periodId,
    frequency,
    saladsPerDelivery,
    paidDeliveryDays,
    carryoverDaysUsed = 0,
    carryoverFromSubscriptionId,
    compensationCreditDaysUsed = 0,
    weeklySelections,
  } = input;

  const result = await createOrUpdateSubscription(
    periodId,
    frequency,
    saladsPerDelivery,
    paidDeliveryDays,
    carryoverDaysUsed,
    carryoverFromSubscriptionId,
    compensationCreditDaysUsed
  );
  if (result.error || !result.subscriptionId) {
    return { ...result, stage: "subscription" };
  }

  const hasDates = weeklySelections.some((w) => w.selectedDays.length > 0);
  if (hasDates) {
    const syncResult = await bulkSaveDeliveryDays(
      result.subscriptionId,
      weeklySelections
    );
    if (syncResult.error) {
      return {
        error: syncResult.error,
        subscriptionId: result.subscriptionId,
        stage: "deliveryDays",
      };
    }

    if (carryoverDaysUsed > 0) {
      const resolveResult = await resolveCarryoverReplacement(
        result.subscriptionId
      );
      if (resolveResult.error) {
        return {
          error: resolveResult.error,
          subscriptionId: result.subscriptionId,
          stage: "carryover",
        };
      }
    }
  }

  return { success: true, subscriptionId: result.subscriptionId };
}

export async function updatePaymentAndMarkPaid(
  subscriptionId: string,
  paymentMethod: PaymentMethod
): Promise<ActionResult> {
  const supabase = await createClient();
  // Local JWT validation — this hot path only needs the caller's id.
  const userId = await getAuthUserId();

  if (!userId) return { error: "AUTH_REQUIRED" };

  // Update and read back paid_at in one round trip; stamp paid_at afterwards
  // only on the first pending → completed transition so re-marking an
  // already-paid subscription preserves the original timestamp.
  const { data: updated, error } = await supabase
    .from("subscriptions")
    .update({
      payment_method: paymentMethod,
      payment_status: "completed",
    })
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .select("paid_at")
    .maybeSingle();

  if (error) return { error: error.message };

  if (updated && !updated.paid_at) {
    const { error: paidAtError } = await supabase
      .from("subscriptions")
      .update({ paid_at: new Date().toISOString() })
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .is("paid_at", null);
    if (paidAtError) return { error: paidAtError.message };
  }

  await finalizeCompensationCreditsOnPayment(userId, subscriptionId);

  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/compensation");
  return { success: true };
}

export async function updatePaymentMethod(
  subscriptionId: string,
  paymentMethod: PaymentMethod
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("subscriptions")
    .update({ payment_method: paymentMethod })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  return { success: true };
}

export async function adminUpdateSubscriptionPayment(
  subscriptionId: string,
  paymentMethod: PaymentMethod,
  paymentStatus: "pending" | "completed"
): Promise<ActionResult> {
  const supabase = await createClient();

  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile?.role || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: "권한이 없습니다" };
  }

  // Keep paid_at in sync with payment_status transitions so downstream
  // reporting (admin subscription-status list) shows when the admin
  // confirmed the payment. We only stamp paid_at on an actual transition
  // from 'pending' → 'completed' so resaving an already-paid subscription
  // (e.g. changing the payment method) doesn't overwrite the original
  // timestamp. Reverting to 'pending' clears the timestamp.
  const { data: currentSub } = await supabase
    .from("subscriptions")
    .select("payment_status, paid_at, user_id")
    .eq("id", subscriptionId)
    .maybeSingle();

  const updatePayload: Record<string, unknown> = {
    payment_method: paymentMethod,
    payment_status: paymentStatus,
  };

  if (paymentStatus === "completed") {
    const wasAlreadyCompleted = currentSub?.payment_status === "completed";
    if (!wasAlreadyCompleted || !currentSub?.paid_at) {
      updatePayload.paid_at = new Date().toISOString();
    }
  } else {
    updatePayload.paid_at = null;
  }

  const { error } = await supabase
    .from("subscriptions")
    .update(updatePayload)
    .eq("id", subscriptionId);

  if (error) return { error: error.message };

  const subUserId = currentSub?.user_id as string | undefined;
  if (subUserId && paymentStatus === "completed") {
    await finalizeCompensationCreditsOnPayment(subUserId, subscriptionId);
  } else if (subUserId && paymentStatus === "pending") {
    const admin = createAdminClient();
    await admin
      .from("compensation_credits")
      .update({ applied_at: null })
      .eq("user_id", subUserId)
      .eq("applied_to_subscription_id", subscriptionId);
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/compensation");
  return { success: true };
}

export async function adminAddSubscription(
  periodId: string,
  userId: string,
  frequencyPerWeek: number,
  saladsPerDelivery: number,
  deliveryDates?: string[]
): Promise<ActionResult> {
  const supabase = await createClient();

  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile?.role || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: "권한이 없습니다" };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("period_id", periodId)
    .single();

  if (existing) return { error: "이미 구독 중인 사용자입니다" };

  const { data: inserted, error } = await admin.from("subscriptions").insert({
    user_id: userId,
    period_id: periodId,
    frequency_per_week: frequencyPerWeek,
    salads_per_delivery: saladsPerDelivery,
    total_delivery_days: deliveryDates?.length ?? null,
    payment_method: null,
    payment_status: "pending",
  }).select("id").single();

  if (error) return { error: error.message };

  if (deliveryDates && deliveryDates.length > 0 && inserted) {
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
      subscription_id: inserted.id,
      week_start: weekStart,
      selected_days: days.sort((a, b) => a - b),
    }));

    const { error: ddError } = await admin.from("delivery_days").insert(rows);
    if (ddError) return { error: ddError.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function adminDeleteSubscription(
  subscriptionId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile?.role || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: "권한이 없습니다" };
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, user_id, subscription_periods(delivery_start, delivery_end)")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!sub) return { error: "구독을 찾을 수 없습니다" };

  const period = (sub as any).subscription_periods;
  if (period?.delivery_start && period?.delivery_end) {
    await admin
      .from("user_menu_selections")
      .delete()
      .eq("user_id", (sub as any).user_id)
      .gte("delivery_date", period.delivery_start)
      .lte("delivery_date", period.delivery_end);
  }

  const { error } = await admin
    .from("subscriptions")
    .delete()
    .eq("id", subscriptionId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  return { success: true };
}

// ─── Admin Queries ───────────────────────────────────────────

export async function getSubscriptionsByPeriod(
  periodId: string
): Promise<
  (Subscription & {
    realName: string;
    profiles: { nickname: string; email: string; real_name: string };
    deliveryDayCount: number;
  })[]
> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !callerProfile?.role ||
    !["admin", "super_admin"].includes(callerProfile.role)
  ) {
    return [];
  }

  const admin = createAdminClient();

  const { data: subsRaw } = await admin
    .from("subscriptions")
    .select("*")
    .eq("period_id", periodId)
    .order("created_at", { ascending: false });

  const subs = subsRaw ?? [];
  if (subs.length === 0) return [];

  const userIds = [...new Set(subs.map((s) => s.user_id as string))];
  const subIds = subs.map((s) => s.id as string);

  const [{ data: profiles }, { data: deliveryRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, real_name, nickname, email")
      .in("id", userIds),
    admin
      .from("delivery_days")
      .select("subscription_id, week_start, selected_days")
      .in("subscription_id", subIds),
  ]);

  const profileMap = new Map<
    string,
    { real_name: string; nickname: string; email: string }
  >();
  for (const p of profiles ?? []) {
    profileMap.set(p.id as string, {
      real_name: (p.real_name as string) || "",
      nickname: (p.nickname as string) || "",
      email: (p.email as string) || "",
    });
  }

  const { expandDeliveryDaysToDateStrings } = await import("@/lib/delivery-days");
  const countBySub = new Map<string, number>();
  const rowsBySub = new Map<string, { week_start: string; selected_days: number[] }[]>();
  for (const row of deliveryRows ?? []) {
    const subId = row.subscription_id as string;
    const rows = rowsBySub.get(subId) ?? [];
    rows.push({
      week_start: row.week_start as string,
      selected_days: (row.selected_days as number[]) ?? [],
    });
    rowsBySub.set(subId, rows);
  }
  for (const [subId, rows] of rowsBySub) {
    countBySub.set(
      subId,
      expandDeliveryDaysToDateStrings(rows).length
    );
  }

  return subs.map((sub) => {
    const profile = profileMap.get(sub.user_id as string);
    const realName = profile?.real_name || "이름 없음";
    return {
      ...sub,
      realName,
      profiles: {
        real_name: profile?.real_name ?? "",
        nickname: profile?.nickname ?? "",
        email: profile?.email ?? "",
      },
      deliveryDayCount: countBySub.get(sub.id as string) ?? 0,
    };
  });
}

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_LABELS = ["첫째주", "둘째주", "셋째주", "넷째주", "다섯째주", "여섯째주"];

export async function getSubscriptionSummaryText(
  periodId: string
): Promise<string> {
  const supabase = await createClient();

  const [{ data: periodData }, { data: allSubs }] = await Promise.all([
    supabase.from("subscription_periods").select("*").eq("id", periodId).single(),
    supabase
      .from("subscriptions")
      .select("*, profiles(real_name, email)")
      .eq("period_id", periodId)
      .order("created_at"),
  ]);

  if (!periodData || !allSubs || allSubs.length === 0) return "";

  const subIds = allSubs.map((s: any) => s.id);
  const { data: allDeliveryDays } = await supabase
    .from("delivery_days")
    .select("subscription_id, week_start, selected_days")
    .in("subscription_id", subIds);

  // Build per-subscription weekday union and per-week details
  const deliveryDayMap = new Map<string, Set<number>>();
  const perWeekMap = new Map<string, { week_start: string; selected_days: number[] }[]>();
  for (const dd of allDeliveryDays ?? []) {
    const existing = deliveryDayMap.get(dd.subscription_id) ?? new Set<number>();
    for (const d of dd.selected_days ?? []) existing.add(d);
    deliveryDayMap.set(dd.subscription_id, existing);

    const weeks = perWeekMap.get(dd.subscription_id) ?? [];
    weeks.push({ week_start: dd.week_start, selected_days: dd.selected_days ?? [] });
    perWeekMap.set(dd.subscription_id, weeks);
  }

  // A user is "custom" if their unique weekday set doesn't match their stored frequency,
  // meaning they picked different days in different weeks rather than a consistent preset.
  function isCustomSchedule(subId: string, freq: number): boolean {
    const days = deliveryDayMap.get(subId);
    if (!days || days.size === 0) return false;
    return days.size !== freq;
  }

  // Summarize a custom user's schedule: base pattern + exception notes
  // e.g. "주 2회 신청(화,목) *1주차는 월,목" or "주 1회 신청(화) *3주차 제외"
  function describeCustomSchedule(subId: string, freq: number): string {
    const weeks = perWeekMap.get(subId) ?? [];
    if (weeks.length === 0) return `주 ${freq}회 신청`;

    const sorted = [...weeks].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const patterns = sorted.map((w) => [...w.selected_days].sort());

    // Find the most common pattern (mode) as the base
    const patternCounts = new Map<string, { count: number; days: number[] }>();
    for (const p of patterns) {
      const key = p.join(",");
      const existing = patternCounts.get(key);
      patternCounts.set(key, { count: (existing?.count ?? 0) + 1, days: p });
    }
    const baseDays = [...patternCounts.values()].sort((a, b) => b.count - a.count)[0].days;
    const baseKey = baseDays.join(",");

    const fmtDays = (days: number[]) =>
      days.length === 5 && [...days].sort().join(",") === "1,2,3,4,5"
        ? "월~금"
        : days.map((d) => WEEKDAY_NAMES[d]).join(",");

    const baseDayStr = fmtDays(baseDays);

    const exceptions: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const weekPattern = patterns[i].join(",");
      if (weekPattern === baseKey) continue;

      if (patterns[i].length === 0) {
        exceptions.push(`${i + 1}주차 제외`);
      } else {
        exceptions.push(`${i + 1}주차는 ${fmtDays(patterns[i])}`);
      }
    }

    const header = `주 ${freq}회 신청(${baseDayStr})`;
    if (exceptions.length === 0) return header;
    return `${header} *${exceptions.join(", ")}`;
  }

  const monthMatch = periodData.target_month?.match(/(\d+)월/);
  const month = monthMatch ? monthMatch[1] : periodData.target_month;

  type GroupEntry = {
    name: string;
    price: number;
    paymentLabel: string;
  };

  const paymentLabels: Record<string, string> = {
    gift_certificate: "성남사랑",
    bank_transfer: "계좌이체",
    credit_card: "신용카드",
  };

  function buildGroupedSection(subs: any[]) {
    const groups = new Map<string, { freq: number; weekdays: string; entries: GroupEntry[] }>();
    const customEntries: { name: string; price: number; paymentLabel: string; schedule: string }[] = [];

    for (const sub of subs) {
      const freq = sub.frequency_per_week as number;
      const salads = sub.salads_per_delivery as number;
      // Use `||` (not `??`) so rows stored with total_delivery_days = 0
      // also fall back to the frequency-based estimate. Without this, a
      // subscriber who paid but never committed dates shows up as 0원
      // in the summary even though they were charged the full amount.
      const totalDays = (sub.total_delivery_days as number | null) || freq * 4;
      const totalSalads = totalDays * salads;
      const price = totalSalads * (periodData.price_per_salad ?? 0);
      const name = sub.profiles?.real_name ?? "이름 없음";
      const methodLabel = paymentLabels[sub.payment_method ?? ""] ?? sub.payment_method ?? "미선택";

      if (isCustomSchedule(sub.id, freq)) {
        const schedule = describeCustomSchedule(sub.id, freq);
        customEntries.push({ name, price, paymentLabel: methodLabel, schedule });
        continue;
      }

      const days = deliveryDayMap.get(sub.id);
      let weekdayStr = "";
      if (days && days.size > 0) {
        const sorted = Array.from(days).sort();
        weekdayStr = sorted.length === 5 && sorted.join(",") === "1,2,3,4,5"
          ? "월~금"
          : sorted.map((d) => WEEKDAY_NAMES[d]).join(",");
      }

      const key = `${freq}-${weekdayStr}`;
      const group = groups.get(key) ?? { freq, weekdays: weekdayStr, entries: [] };
      group.entries.push({ name, price, paymentLabel: methodLabel });
      groups.set(key, group);
    }

    const lines: string[] = [];
    let groupIdx = 1;
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.freq - b.freq);
    for (const group of sortedGroups) {
      const emoji = emojis[groupIdx - 1] ?? `${groupIdx}.`;
      const weekdayPart = group.weekdays ? `(${group.weekdays})` : "";
      lines.push(`${emoji} 주 ${group.freq}회 신청${weekdayPart} ${group.entries.length}명`);
      for (const entry of group.entries) {
        lines.push(`- ${entry.name} ${entry.price.toLocaleString()}원 (${entry.paymentLabel})`);
      }
      groupIdx++;
    }

    for (const entry of customEntries) {
      const emoji = emojis[groupIdx - 1] ?? `${groupIdx}.`;
      lines.push(`${emoji} ${entry.schedule}`);
      lines.push(`- ${entry.name} ${entry.price.toLocaleString()}원 (${entry.paymentLabel})`);
      groupIdx++;
    }

    return lines;
  }

  // Build weekly delivery count per weekday across all subscribers in the set
  function buildWeeklyBreakdown(subs: any[]) {
    const subIdSet = new Set(subs.map((s: any) => s.id));
    const saladsMap = new Map<string, number>();
    for (const sub of subs) saladsMap.set(sub.id, sub.salads_per_delivery ?? 1);

    // Group delivery days by week_start
    const weekMap = new Map<string, Map<number, number>>();
    for (const dd of allDeliveryDays ?? []) {
      if (!subIdSet.has(dd.subscription_id)) continue;
      const perDelivery = saladsMap.get(dd.subscription_id) ?? 1;
      const weekDays = weekMap.get(dd.week_start) ?? new Map<number, number>();
      for (const day of dd.selected_days ?? []) {
        weekDays.set(day, (weekDays.get(day) ?? 0) + perDelivery);
      }
      weekMap.set(dd.week_start, weekDays);
    }

    if (weekMap.size === 0) return [];

    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const lines: string[] = [];
    lines.push("");

    for (let i = 0; i < sortedWeeks.length; i++) {
      const [, dayCountMap] = sortedWeeks[i];
      const label = WEEK_LABELS[i] ?? `${i + 1}째주`;
      const sortedDays = Array.from(dayCountMap.entries()).sort((a, b) => a[0] - b[0]);
      const parts = sortedDays.map(([day, count]) => `${WEEKDAY_NAMES[day]}요일 ${count}개`);
      lines.push(`${month}월 ${label}는 ${parts.join(", ")} 배송해주시면 돼요.`);
    }

    return lines;
  }

  const paidSubs = allSubs.filter((s: any) => s.payment_status === "completed");
  const unpaidSubs = allSubs.filter((s: any) => s.payment_status !== "completed");

  const sections: string[] = [];

  if (paidSubs.length > 0) {
    sections.push(`안녕하세요! ${month}월 신청 및 결제가 모두 완료되어 전달드려요:)`);
    sections.push(`모두 ${month}월 한달 구독 예정입니다.`);
    sections.push("");
    sections.push(...buildGroupedSection(paidSubs));
    sections.push(...buildWeeklyBreakdown(paidSubs));
  }

  if (unpaidSubs.length > 0) {
    if (paidSubs.length > 0) {
      sections.push("");
      sections.push("─".repeat(20));
      sections.push("");
    }
    sections.push(`[미결제] ${month}월 신청은 완료했지만 아직 결제가 안 된 분들이에요.`);
    sections.push("");
    sections.push(...buildGroupedSection(unpaidSubs));
  }

  return sections.join("\n");
}

// Returns dates where the current user is the only subscriber (needs 2+ for delivery)
export async function getSoloDeliveryDates(
  periodId: string
): Promise<{ date: string; weekday: string }[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: allSubs } = await supabase
    .from("subscriptions")
    .select("id, user_id")
    .eq("period_id", periodId);

  if (!allSubs?.length) return [];

  const subIds = allSubs.map((s: any) => s.id);
  const mySubIds = new Set(allSubs.filter((s: any) => s.user_id === user.id).map((s: any) => s.id));

  const [{ data: disabledProfiles }, { data: allDeliveryDays }] = await Promise.all([
    supabase.from("profiles").select("id").eq("status", "disabled"),
    supabase.from("delivery_days").select("subscription_id, week_start, selected_days, user_id").in("subscription_id", subIds),
  ]);

  if (!allDeliveryDays?.length) return [];

  const disabledIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

  // Count total salads per date across all subscribers, and track which dates are mine
  const dateCounts: Record<string, number> = {};
  const myDates = new Set<string>();

  for (const dd of allDeliveryDays) {
    if (disabledIds.has(dd.user_id)) continue;
    for (const day of dd.selected_days ?? []) {
      const date = new Date(dd.week_start + "T00:00:00");
      date.setDate(date.getDate() + day - 1);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      dateCounts[dateStr] = (dateCounts[dateStr] ?? 0) + 1;
      if (mySubIds.has(dd.subscription_id)) {
        myDates.add(dateStr);
      }
    }
  }

  const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
  const soloResults: { date: string; weekday: string }[] = [];

  for (const dateStr of myDates) {
    if ((dateCounts[dateStr] ?? 0) < 2) {
      const dt = new Date(dateStr + "T00:00:00");
      soloResults.push({
        date: dateStr,
        weekday: WEEKDAY_KR[dt.getDay()],
      });
    }
  }

  return soloResults.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Delivery Skip / Vacation Postponement ──────────────────────────────────

/** Returns skipped delivery entries for a subscription (current user).
 *  Each entry carries whether the skip was a same-month reschedule or a
 *  vacation skip (next-month credit). */
export async function getMySkippedDates(
  subscriptionId: string
): Promise<{ date: string; isReschedule: boolean }[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data } = await supabase
    .from("skipped_delivery_days")
    .select("delivery_date, skip_reason")
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id);

  return (data ?? []).map((r: { delivery_date: string; skip_reason: string | null }) => ({
    date: r.delivery_date,
    isReschedule: r.skip_reason === "reschedule",
  }));
}

/** Batched variant: skipped dates for many subscriptions in one query. */
export async function getMySkippedDatesBySubscriptionIds(
  subscriptionIds: string[]
): Promise<Record<string, { date: string; isReschedule: boolean }[]>> {
  const uniqueIds = [...new Set(subscriptionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return {};

  const { data } = await supabase
    .from("skipped_delivery_days")
    .select("subscription_id, delivery_date, skip_reason")
    .in("subscription_id", uniqueIds)
    .eq("user_id", user.id);

  const grouped: Record<string, { date: string; isReschedule: boolean }[]> = {};
  for (const id of uniqueIds) grouped[id] = [];
  for (const row of (data ?? []) as {
    subscription_id: string;
    delivery_date: string;
    skip_reason: string | null;
  }[]) {
    (grouped[row.subscription_id] ??= []).push({
      date: row.delivery_date,
      isReschedule: row.skip_reason === "reschedule",
    });
  }
  return grouped;
}

/**
 * Returns skipped delivery date strings for any user's subscription (admin).
 */
export async function getAdminSkippedDates(
  subscriptionId: string
): Promise<string[]> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("skipped_delivery_days")
    .select("delivery_date")
    .eq("subscription_id", subscriptionId);

  return (data ?? []).map((r) => r.delivery_date as string);
}

/**
 * Syncs the vacation-skip compensation_credits entry for a subscription after
 * adding or removing skips. One credit entry per subscription (reason = vacation_skip).
 */
async function syncVacationSkipCredit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subscriptionId: string,
  sourcePeriod: string | null
): Promise<void> {
  // Count vacation skips: rows with skip_reason IS NULL or skip_reason != 'reschedule'.
  // Cannot use .neq() alone because NULL != 'reschedule' evaluates to NULL in SQL,
  // which means null-reason rows would be excluded from the count.
  const { count } = await supabase
    .from("skipped_delivery_days")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .or("skip_reason.is.null,skip_reason.neq.reschedule");

  const totalSkipped = count ?? 0;

  // Find existing auto-created vacation-skip credit (identified by source_subscription_id)
  const { data: existing } = await supabase
    .from("compensation_credits")
    .select("id, applied_at")
    .eq("user_id", userId)
    .eq("source_subscription_id" as any, subscriptionId)
    .is("applied_at", null)
    .maybeSingle();

  if (totalSkipped === 0) {
    if (existing) {
      await supabase.from("compensation_credits").delete().eq("id", existing.id);
    }
    return;
  }

  // Format a human-readable reason like "6월 구독 연기"
  const monthMatch = sourcePeriod?.match(/(\d+)월/);
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
      source_period: sourcePeriod,
      source_subscription_id: subscriptionId,
      reason: reasonStr,
    });
  }
}

/**
 * Skip specific delivery dates for a subscription.
 * - Regular users: 2-day cutoff enforced (cannot skip within 2 days of delivery).
 * - Admin override: pass bypassCutoff=true.
 */
export async function skipDeliveryDates(
  subscriptionId: string,
  deliveryDates: string[],
  skipReason?: string,
  bypassCutoff = false
): Promise<{ error?: string; skippedCount?: number }> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, user_id, salads_per_delivery, subscription_periods(target_month)")
    .eq("id", subscriptionId)
    .single();

  if (!sub) return { error: "구독을 찾을 수 없어요." };

  const isOwner = sub.user_id === user.id;
  const isAdmin = bypassCutoff;

  if (!isOwner && !isAdmin) return { error: "권한이 없어요." };

  // 2-day cutoff: delivery_date must be at least 2 days from today
  const today = getKSTDate();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 2);
  const cutoffStr = formatDateISO(cutoff);

  const eligibleDates = bypassCutoff
    ? deliveryDates
    : deliveryDates.filter((d) => d >= cutoffStr);

  if (eligibleDates.length === 0) {
    return {
      error:
        "스킵 가능한 날짜가 없어요. 배송 2일 전까지만 취소할 수 있어요.",
    };
  }

  const rows = eligibleDates.map((d) => ({
    user_id: sub.user_id,
    subscription_id: subscriptionId,
    delivery_date: d,
    skipped_by: user.id,
    skip_reason: skipReason ?? null,
  }));

  const { error: insertError } = await supabase
    .from("skipped_delivery_days")
    .upsert(rows, { onConflict: "subscription_id,delivery_date" });

  if (insertError) return { error: insertError.message };

  // Remove skipped dates from delivery_days so all pages see them as inactive.
  // unskipDeliveryDates will add them back if the skip is undone.
  for (const dateStr of eligibleDates) {
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

  const periodInfo = sub.subscription_periods as { target_month: string } | null;
  await syncVacationSkipCredit(
    supabase,
    sub.user_id,
    subscriptionId,
    periodInfo?.target_month ?? null
  );

  revalidateAfterDeliveryScheduleChange(sub.user_id as string);
  revalidatePath("/admin/users");
  revalidatePath("/admin/compensation");

  if (isOwner && !bypassCutoff) {
    await notifyAdminsOfDeliveryPostpone({
      targetUserId: sub.user_id as string,
      subscriptionId,
      targetMonth: periodInfo?.target_month ?? "",
      skippedDates: eligibleDates,
      actorUserId: user.id,
    });
  }

  return { skippedCount: eligibleDates.length };
}

/**
 * Undo a skip for specific delivery dates.
 * The associated compensation credit is reduced or deleted accordingly.
 */
export async function unskipDeliveryDates(
  subscriptionId: string,
  deliveryDates: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { error: delError } = await supabase
    .from("skipped_delivery_days")
    .delete()
    .eq("subscription_id", subscriptionId)
    .in("delivery_date", deliveryDates);

  if (delError) return { error: delError.message };

  // Re-sync the credit based on remaining skips
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id, subscription_periods(target_month)")
    .eq("id", subscriptionId)
    .single();

  // Restore the dates back into delivery_days
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
    } else if (sub) {
      await supabase.from("delivery_days").insert({
        user_id: sub.user_id,
        subscription_id: subscriptionId,
        week_start: weekStart,
        selected_days: [dow],
      });
    }
  }

  if (sub) {
    const periodInfo = sub.subscription_periods as { target_month: string } | null;
    await syncVacationSkipCredit(
      supabase,
      sub.user_id,
      subscriptionId,
      periodInfo?.target_month ?? null
    );
  }

  revalidateAfterDeliveryScheduleChange(sub?.user_id as string | undefined);
  revalidatePath("/admin/users");
  revalidatePath("/admin/compensation");

  return {};
}

/**
 * Reschedule delivery dates within the same month.
 * - Skips the specified dates (no compensation credit — different from vacation skip).
 * - Adds replacement dates as new delivery_days rows for the subscription.
 */
export async function rescheduleDeliveryDates(
  subscriptionId: string,
  datesToSkip: string[],
  replacementDates: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, user_id, subscription_periods(target_month)")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();
  if (!sub) return { error: "구독을 찾을 수 없습니다." };

  const periodInfo = sub.subscription_periods as { target_month: string } | null;

  const validation = await validateDeliveryDateStringsForSubscription(
    supabase,
    replacementDates
  );
  if (validation.error) return { error: validation.error };

  // Mark original dates as skipped (reason = reschedule, no compensation credit)
  // AND remove them from delivery_days so they are no longer treated as active.
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
      const updated = days.filter((day) => day !== dow);
      if (updated.length === 0) {
        await supabase.from("delivery_days").delete().eq("id", existing.id);
      } else {
        await supabase
          .from("delivery_days")
          .update({ selected_days: updated })
          .eq("id", existing.id);
      }
    }
  }

  if (datesToSkip.length > 0) {
    const skipRows = datesToSkip.map((date) => ({
      user_id: user.id,
      subscription_id: subscriptionId,
      delivery_date: date,
      skipped_by: user.id,
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
        const { error } = await supabase
          .from("delivery_days")
          .update({ selected_days: [...days, dow].sort((a, b) => a - b) })
          .eq("id", existing.id);
        if (error) return { error: error.message };
      }
    } else {
      const { error } = await supabase.from("delivery_days").insert({
        user_id: user.id,
        subscription_id: subscriptionId,
        week_start: weekStart,
        selected_days: [dow],
      });
      if (error) return { error: error.message };
    }
  }

  // A replacement date is being "re-activated", so remove any prior skip record
  // for it. Without this, moving back to a previously-skipped date would leave
  // that date stuck in the cancelled state even though it's now a live delivery.
  if (replacementDates.length > 0) {
    await supabase
      .from("skipped_delivery_days")
      .delete()
      .eq("subscription_id", subscriptionId)
      .in("delivery_date", replacementDates);
  }

  revalidateAfterDeliveryScheduleChange(user.id);

  await notifyAdminsOfDeliveryReschedule({
    targetUserId: user.id,
    subscriptionId,
    targetMonth: periodInfo?.target_month ?? "",
    skippedDates: datesToSkip,
    replacementDates,
    actorUserId: user.id,
  });

  return {};
}
