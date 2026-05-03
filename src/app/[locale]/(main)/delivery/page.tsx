import {
  getActivePeriod,
  getMySubscriptions,
  getSubscriptionPeriods,
} from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import {
  getMenuSelectionCutoff,
  getWeeklyMenuDeadlines,
} from "@/lib/actions/admin";
import { countSelectedDays, getKSTDate } from "@/lib/utils";
import { DeliveryDaySelector } from "./delivery-day-selector";
import type { Subscription, SubscriptionPeriod } from "@/types";

type SubscriptionWithPeriod = Subscription & {
  subscription_periods?: SubscriptionPeriod | null;
};

function getEffectiveTotalDays(subscription: Subscription): number {
  return (
    (subscription.total_delivery_days ?? 0) ||
    subscription.frequency_per_week * 4
  );
}

function hasClosureInPeriod(
  period: SubscriptionPeriod | null | undefined,
  closures: { closure_date: string }[]
): boolean {
  if (!period?.delivery_start || !period.delivery_end) return false;
  const start = period.delivery_start.slice(0, 10);
  const end = period.delivery_end.slice(0, 10);
  return closures.some(
    (closure) => closure.closure_date >= start && closure.closure_date <= end
  );
}

function addNextMonthEnd(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const nextMonthEnd = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  return `${nextMonthEnd.getFullYear()}-${String(nextMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(nextMonthEnd.getDate()).padStart(2, "0")}`;
}

function getMondayISO(dateStr: string | null): string {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function DeliveryPage() {
  const now = getKSTDate();
  const activePeriod = await getActivePeriod();

  if (!activePeriod) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-muted-foreground">
        활성화된 구독 기간이 없습니다
      </div>
    );
  }

  const [allSubscriptions, allPeriods, holidays, storeClosures, nextYearClosures, nextYearHolidays] =
    await Promise.all([
      getMySubscriptions(),
      getSubscriptionPeriods(),
      getHolidays(now.getFullYear()),
      getStoreClosures(now.getFullYear()),
      getStoreClosures(now.getFullYear() + 1),
      getHolidays(now.getFullYear() + 1),
    ]);
  const allStoreClosures = [...storeClosures, ...nextYearClosures];
  const activeSubscription =
    allSubscriptions.find((s) => s.period_id === activePeriod.id) ?? null;

  let subscription = activeSubscription;
  let period: SubscriptionPeriod | null = activePeriod;
  let deliveryDays = subscription ? await getMyDeliveryDays(subscription.id) : [];
  let replacementMode = false;
  let remainingSlots = 0;

  // If a paid subscription lost dates because of a store closure, prioritize
  // that subscription even when getActivePeriod() has already moved to the
  // next payment window. Otherwise /delivery can point at the wrong month and
  // the replacement dates never open.
  const replacementCandidates: {
    subscription: Subscription;
    period: SubscriptionPeriod;
    deliveryDays: Awaited<ReturnType<typeof getMyDeliveryDays>>;
    remainingSlots: number;
  }[] = [];

  for (const sub of allSubscriptions as SubscriptionWithPeriod[]) {
    const subPeriod = sub.subscription_periods;
    if (sub.payment_status !== "completed") continue;
    if (!hasClosureInPeriod(subPeriod, allStoreClosures)) continue;

    const days = await getMyDeliveryDays(sub.id);
    const effectiveTotal = getEffectiveTotalDays(sub);
    const selectedCount = countSelectedDays(days);
    const usedCarryoverDays = (allSubscriptions as Subscription[]).reduce(
      (sum, other) =>
        other.carryover_from_subscription_id === sub.id
          ? sum + ((other.carryover_delivery_days ?? 0) as number)
          : sum,
      0
    );
    const missing = Math.max(0, effectiveTotal - selectedCount - usedCarryoverDays);
    const isClosureReplacement =
      sub.closure_reselection_required === true || selectedCount > 0;
    if (!isClosureReplacement) continue;
    if (missing <= 0 || !subPeriod) continue;
    replacementCandidates.push({
      subscription: sub,
      period: subPeriod,
      deliveryDays: days,
      remainingSlots: missing,
    });
  }

  replacementCandidates.sort((a, b) =>
    (a.period.delivery_start ?? "").localeCompare(b.period.delivery_start ?? "")
  );

  if (replacementCandidates.length > 0) {
    const candidate = replacementCandidates[0];
    subscription = candidate.subscription;
    period = candidate.period;
    deliveryDays = candidate.deliveryDays;
    remainingSlots = candidate.remainingSlots;
    replacementMode = true;
  } else if (subscription) {
    const effectiveTotal = getEffectiveTotalDays(subscription);
    remainingSlots = Math.max(0, effectiveTotal - countSelectedDays(deliveryDays));
  }

  if (!subscription || !period) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-muted-foreground">
        먼저 구독을 신청해주세요
      </div>
    );
  }

  const nextPeriod = allPeriods
    .filter(
      (p) =>
        p.id !== period.id &&
        p.delivery_start &&
        period.delivery_start &&
        p.delivery_start > period.delivery_start
    )
    .sort((a, b) =>
      (a.delivery_start ?? "").localeCompare(b.delivery_start ?? "")
    )[0];
  const effectiveDeliveryEnd =
    replacementMode
      ? (nextPeriod?.delivery_end ?? addNextMonthEnd(period.delivery_end))
      : period.delivery_end;
  const allHolidays = [...holidays, ...nextYearHolidays];
  const [cutoff, deadlines] = await Promise.all([
    getMenuSelectionCutoff(),
    getWeeklyMenuDeadlines(getMondayISO(period.delivery_start), effectiveDeliveryEnd ?? period.delivery_end ?? getMondayISO(null)),
  ]);
  const blockedDays = [
    ...allHolidays,
    ...allStoreClosures.map((closure) => ({
      id: closure.id,
      holiday_date: closure.closure_date,
      name: closure.reason || "매장 휴무",
      source: "store_closure" as const,
    })),
  ];

  return (
    <DeliveryDaySelector
      subscription={subscription}
      deliveryDays={deliveryDays}
      holidays={blockedDays}
      periodMonth={period.target_month}
      deliveryStart={period.delivery_start}
      deliveryEnd={effectiveDeliveryEnd}
      replacementMode={replacementMode}
      remainingSlots={remainingSlots}
      cutoffDay={cutoff.day}
      cutoffTime={cutoff.time}
      deadlineOverrides={Object.fromEntries(
        deadlines.map((d) => [d.week_start, d.deadline_at])
      )}
    />
  );
}
