import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  getActivePeriod,
  getNextApplicablePeriod,
  getMySubscription,
  getMyLastPaymentMethod,
  getSubscriptionPeriodById,
  getMyCarryoverReplacement,
} from "@/lib/actions/subscription";
import type { CarryoverReplacement } from "@/lib/actions/subscription";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { getMyDeliveryDays, getMyPreviousDeliveryDates } from "@/lib/actions/delivery";
import { getOpenSubscriptionHold, getSubscriptionHoldUiAccess } from "@/lib/actions/subscription-hold";
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
      const [subForClosed, next] = await Promise.all([
        getMySubscription(activePeriod.id),
        getNextApplicablePeriod(activePeriod.id),
      ]);
      if (!subForClosed && next) activePeriod = next;
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

  // ── First batch: everything that doesn't depend on whether sub exists ──
  const [sub, holidayData, storeClosures, lastPm, carryover, holdUiAccess] =
    await Promise.all([
      getMySubscription(period.id),
      getHolidays(deliveryYear),
      getStoreClosures(deliveryYear),
      getMyLastPaymentMethod(),
      getMyCarryoverReplacement(period.id),
      getSubscriptionHoldUiAccess(), // moved into this batch (was sequential before)
    ]);

  const storeClosureDates = storeClosures.map((c) => c.closure_date);
  const holidays = [
    ...holidayData.map((h) => h.holiday_date),
    ...storeClosureDates,
  ];

  // ── Second batch: depends on whether sub exists ──────────────
  let savedDateStrings: string[] = [];
  let openHold = null;
  let previousDeliveryDates: string[] = [];

  if (sub) {
    const [deliveryDays, hold] = await Promise.all([
      getMyDeliveryDays(sub.id),
      getOpenSubscriptionHold(sub.id),
    ]);
    savedDateStrings = deliveryDaysToDateStrings(deliveryDays);
    openHold = hold;
  } else {
    previousDeliveryDates = await getMyPreviousDeliveryDates(period.id);
  }

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
