import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  getActivePeriod,
  getNextApplicablePeriod,
  getMySubscriptionBundle,
  getMyLastPaymentMethod,
  getSubscriptionPeriodById,
  getMyCarryoverReplacement,
} from "@/lib/actions/subscription";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { getMyPreviousDeliveryDates } from "@/lib/actions/delivery";
import { getSubscriptionHoldUiAccess } from "@/lib/actions/subscription-hold";
import { deliveryDaysToDateStrings, getKSTDate } from "@/lib/utils";
import { SubscriptionView } from "./subscription-view";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  // ── Auth + period resolution run in parallel ────────────────
  const [{ period: rawPeriod, params }, profile] = await Promise.all([
    searchParams.then(async (p) => {
      const period = p.period
        ? await getSubscriptionPeriodById(p.period)
        : await getActivePeriod();
      return { period, params: p };
    }),
    getCurrentProfile(),
  ]);

  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const now = getKSTDate();
  const periodIdParam = params.period;

  // ── Closed-period fallback: new subscribers see the next period ─
  // When getActivePeriod() falls back to a delivering month whose pay_end has
  // already passed, show the next upcoming period so the calendar is editable.
  let activePeriod = rawPeriod;
  if (activePeriod && !periodIdParam) {
    const payEnd = activePeriod.pay_end ? new Date(activePeriod.pay_end) : null;
    if (payEnd && now > payEnd) {
      // Fetch both speculatively; `next` is only used when no sub exists.
      // The bundle is request-cached, so when the period stays the same the
      // main batch below reuses this result instead of re-querying.
      const [bundleForClosed, next] = await Promise.all([
        getMySubscriptionBundle(activePeriod.id),
        getNextApplicablePeriod(activePeriod.id),
      ]);
      if (!bundleForClosed.subscription && next) activePeriod = next;
    }
  }

  const period = activePeriod;

  if (!period) {
    return (
      <SubscriptionView
        period={null}
        existingSubscription={null}
        holidays={[]}
        storeClosureDates={[]}
        savedDeliveryDates={[]}
        lastPaymentMethod={null}
        carryoverReplacement={null}
        initialOpenHold={null}
        holdUiAccess={await getSubscriptionHoldUiAccess()}
        previousDeliveryDates={[]}
      />
    );
  }

  const deliveryYear = period.delivery_start
    ? new Date(period.delivery_start + "T00:00:00").getFullYear()
    : now.getFullYear();

  // ── Single parallel batch ─────────────────────────────────────
  // The bundle carries the subscription with its delivery days and open hold
  // in one joined query, so nothing needs a second sequential round trip.
  // Previous delivery dates are fetched speculatively (cheap indexed query)
  // and only used when no subscription exists.
  const [
    bundle,
    holidayData,
    storeClosures,
    lastPm,
    carryover,
    holdUiAccess,
    previousDates,
  ] = await Promise.all([
    getMySubscriptionBundle(period.id),
    getHolidays(deliveryYear),
    getStoreClosures(deliveryYear),
    getMyLastPaymentMethod(),
    getMyCarryoverReplacement(period.id),
    getSubscriptionHoldUiAccess(),
    getMyPreviousDeliveryDates(period.id),
  ]);

  const storeClosureDates = storeClosures.map((c) => c.closure_date);
  const holidays = [
    ...holidayData.map((h) => h.holiday_date),
    ...storeClosureDates,
  ];

  const sub = bundle.subscription;
  const savedDateStrings = sub
    ? deliveryDaysToDateStrings(bundle.deliveryDays)
    : [];
  const openHold = sub ? bundle.openHold : null;
  const previousDeliveryDates = sub ? [] : previousDates;

  return (
    <SubscriptionView
      period={period}
      existingSubscription={sub}
      holidays={holidays}
      storeClosureDates={storeClosureDates}
      savedDeliveryDates={savedDateStrings}
      lastPaymentMethod={lastPm}
      carryoverReplacement={carryover}
      initialOpenHold={openHold}
      holdUiAccess={holdUiAccess}
      previousDeliveryDates={previousDeliveryDates}
    />
  );
}
