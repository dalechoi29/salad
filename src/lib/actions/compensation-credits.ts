import { createAdminClient } from "@/lib/supabase/server";

function vacationSkipReason(sourcePeriod: string | null): string {
  const monthMatch = sourcePeriod?.match(/(\d+)월/);
  return monthMatch ? `${monthMatch[1]}월 구독 연기` : "구독 연기";
}

/**
 * Keep one pending vacation-skip credit for this source subscription.
 * Uses the service-role client because users cannot INSERT compensation_credits (RLS).
 * Days already consumed as later-month carryover or applied credits are excluded
 * so chained postpones do not double-count.
 */
export async function syncVacationSkipCredit(
  userId: string,
  subscriptionId: string,
  sourcePeriod: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const { count, error: countError } = await admin
    .from("skipped_delivery_days")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .or("skip_reason.is.null,skip_reason.neq.reschedule");
  if (countError) return { error: countError.message };

  const totalSkipped = count ?? 0;

  const [{ data: laterSubs }, { data: appliedCredits }, { data: pending }] =
    await Promise.all([
      admin
        .from("subscriptions")
        .select("carryover_delivery_days")
        .eq("carryover_from_subscription_id", subscriptionId),
      admin
        .from("compensation_credits")
        .select("days")
        .eq("user_id", userId)
        .eq("source_subscription_id", subscriptionId)
        .not("applied_at", "is", null),
      admin
        .from("compensation_credits")
        .select("id")
        .eq("user_id", userId)
        .eq("source_subscription_id", subscriptionId)
        .is("applied_at", null)
        .maybeSingle(),
    ]);

  const consumedAsCarryover = (laterSubs ?? []).reduce(
    (sum, row) => sum + ((row.carryover_delivery_days as number | null) ?? 0),
    0
  );
  const appliedDays = (appliedCredits ?? []).reduce(
    (sum, row) => sum + ((row.days as number | null) ?? 0),
    0
  );
  const pendingDays = Math.max(
    0,
    totalSkipped - Math.max(consumedAsCarryover, appliedDays)
  );
  const reasonStr = vacationSkipReason(sourcePeriod);

  if (pendingDays === 0) {
    if (pending?.id) {
      const { error } = await admin
        .from("compensation_credits")
        .delete()
        .eq("id", pending.id);
      if (error) return { error: error.message };
    }
    return {};
  }

  if (pending?.id) {
    const { error } = await admin
      .from("compensation_credits")
      .update({ days: pendingDays, reason: reasonStr })
      .eq("id", pending.id);
    if (error) return { error: error.message };
    return {};
  }

  const { error } = await admin.from("compensation_credits").insert({
    user_id: userId,
    days: pendingDays,
    source_period: sourcePeriod,
    source_subscription_id: subscriptionId,
    reason: reasonStr,
  });
  if (error) return { error: error.message };
  return {};
}

function formatClosureReasonLabel(closureDate: string): string {
  const [, month, day] = closureDate.split("-");
  const monthNum = parseInt(month, 10);
  const dayNum = parseInt(day, 10);
  return `${monthNum}/${dayNum}`;
}

/**
 * Reserve pending compensation credits on a subscription (before payment).
 * Sets applied_to_subscription_id only; applied_at is stamped when payment completes.
 */
export async function reserveCompensationCreditsForSubscription(
  userId: string,
  subscriptionId: string,
  compensationCreditIds: string[]
): Promise<void> {
  const admin = createAdminClient();

  if (compensationCreditIds.length > 0) {
    await admin
      .from("compensation_credits")
      .update({
        applied_to_subscription_id: subscriptionId,
        applied_at: null,
      })
      .in("id", compensationCreditIds)
      .eq("user_id", userId);
  }

  // Release credits no longer tied to this subscription's carryover plan.
  let releaseQuery = admin
    .from("compensation_credits")
    .update({
      applied_to_subscription_id: null,
      applied_at: null,
    })
    .eq("user_id", userId)
    .eq("applied_to_subscription_id", subscriptionId)
    .is("applied_at", null);

  if (compensationCreditIds.length > 0) {
    releaseQuery = releaseQuery.not(
      "id",
      "in",
      `(${compensationCreditIds.join(",")})`
    );
  }

  await releaseQuery;
}

/**
 * Pick compensation credit rows to consume (FIFO) for a given day count.
 */
export async function selectCompensationCreditIdsForDays(
  userId: string,
  daysNeeded: number,
  currentSubscriptionId?: string
): Promise<string[]> {
  if (daysNeeded <= 0) return [];

  const admin = createAdminClient();
  let query = admin
    .from("compensation_credits")
    .select("id, days")
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

  const { data: credits } = await query;
  const ids: string[] = [];
  let remaining = daysNeeded;
  for (const row of credits ?? []) {
    if (remaining <= 0) break;
    ids.push(row.id as string);
    remaining -= row.days as number;
  }
  return ids;
}

/**
 * Finalize reserved credits after payment — moves them to "적용 완료" in admin UI.
 * If the subscription has no carryover days, releases mistaken reservations instead.
 */
export async function finalizeCompensationCreditsOnPayment(
  userId: string,
  subscriptionId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("carryover_delivery_days")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();

  const carryoverDays = (sub?.carryover_delivery_days as number | null) ?? 0;

  if (carryoverDays <= 0) {
    await admin
      .from("compensation_credits")
      .update({
        applied_to_subscription_id: null,
        applied_at: null,
      })
      .eq("user_id", userId)
      .eq("applied_to_subscription_id", subscriptionId)
      .is("applied_at", null);
    return;
  }

  await admin
    .from("compensation_credits")
    .update({ applied_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("applied_to_subscription_id", subscriptionId)
    .is("applied_at", null);
}

/**
 * When a paid subscriber loses a delivery date because of a store closure,
 * grant one free day for their next subscription (compensation_credits).
 * If they already have pending credits, adds a separate row with a distinct reason.
 */
export async function grantStoreClosureCompensationCredits(
  closureDate: string,
  affectedSubscriptionIds: string[]
): Promise<number> {
  if (affectedSubscriptionIds.length === 0) return 0;

  const admin = createAdminClient();
  const closureNote = `closure:${closureDate}`;
  const label = formatClosureReasonLabel(closureDate);
  const baseReason = `${label} 가게 휴무 보상`;
  const additionalReason = `${label} 가게 휴무 보상 (추가)`;

  const { data: subs } = await admin
    .from("subscriptions")
    .select(
      "id, user_id, payment_status, subscription_periods(target_month)"
    )
    .in("id", affectedSubscriptionIds)
    .eq("payment_status", "completed");

  let granted = 0;

  for (const sub of subs ?? []) {
    const userId = sub.user_id as string;
    const subId = sub.id as string;
    const periodRow = sub.subscription_periods as
      | { target_month: string }
      | { target_month: string }[]
      | null;
    const targetMonth = Array.isArray(periodRow)
      ? (periodRow[0]?.target_month ?? "")
      : (periodRow?.target_month ?? "");

    const { data: existingForClosure } = await admin
      .from("compensation_credits")
      .select("id")
      .eq("source_subscription_id", subId)
      .eq("admin_notes", closureNote)
      .maybeSingle();

    if (existingForClosure) continue;

    const { data: pendingCredits } = await admin
      .from("compensation_credits")
      .select("id")
      .eq("user_id", userId)
      .is("applied_at", null)
      .limit(1);

    const hasOtherPending = (pendingCredits?.length ?? 0) > 0;

    const { error } = await admin.from("compensation_credits").insert({
      user_id: userId,
      days: 1,
      source_period: targetMonth,
      source_subscription_id: subId,
      reason: hasOtherPending ? additionalReason : baseReason,
      admin_notes: closureNote,
    });

    if (!error) granted++;
  }

  return granted;
}
