import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  getActivePeriod,
  getMySubscription,
  getMyLastPaymentMethod,
  getSubscriptionPeriodById,
  getMyCarryoverReplacement,
} from "@/lib/actions/subscription";
import type { CarryoverReplacement } from "@/lib/actions/subscription";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { getMyDeliveryDays, getMyPreviousDeliveryWeekdays } from "@/lib/actions/delivery";
import { getOpenSubscriptionHold, getSubscriptionHoldUiAccess } from "@/lib/actions/subscription-hold";
import { deliveryDaysToDateStrings, getKSTDate } from "@/lib/utils";
import { SubscriptionView } from "./subscription-view";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const params = await searchParams;
  const periodIdParam = params.period;

  const period = periodIdParam
    ? await getSubscriptionPeriodById(periodIdParam)
    : await getActivePeriod();

  const now = getKSTDate();
  let existingSubscription = null;
  let holidays: string[] = [];
  let storeClosureDates: string[] = [];
  let savedDateStrings: string[] = [];
  let lastPaymentMethod: string | null = null;
  let carryoverReplacement: CarryoverReplacement | null = null;
  let openHold = null;
  let previousDeliveryWeekdays: number[] = [];

  if (period) {
    const deliveryYear = period.delivery_start
      ? new Date(period.delivery_start + "T00:00:00").getFullYear()
      : now.getFullYear();
    const [sub, holidayData, storeClosures, lastPm, carryover] = await Promise.all([
      getMySubscription(period.id),
      getHolidays(deliveryYear),
      getStoreClosures(deliveryYear),
      getMyLastPaymentMethod(),
      getMyCarryoverReplacement(period.id),
    ]);
    existingSubscription = sub;
    storeClosureDates = storeClosures.map((c) => c.closure_date);
    holidays = [
      ...holidayData.map((h) => h.holiday_date),
      ...storeClosureDates,
    ];
    lastPaymentMethod = lastPm;
    carryoverReplacement = carryover;

    if (sub) {
      const [deliveryDays, hold] = await Promise.all([
        getMyDeliveryDays(sub.id),
        getOpenSubscriptionHold(sub.id),
      ]);
      savedDateStrings = deliveryDaysToDateStrings(deliveryDays);
      openHold = hold;
    } else {
      previousDeliveryWeekdays = await getMyPreviousDeliveryWeekdays(period.id);
    }
  }

  const holdUiAccess = await getSubscriptionHoldUiAccess();

  return (
    <SubscriptionView
      period={period}
      existingSubscription={existingSubscription}
      holidays={holidays}
      storeClosureDates={storeClosureDates}
      savedDeliveryDates={savedDateStrings}
      lastPaymentMethod={lastPaymentMethod}
      carryoverReplacement={carryoverReplacement}
      initialOpenHold={openHold}
      holdUiAccess={holdUiAccess}
      previousDeliveryWeekdays={previousDeliveryWeekdays}
    />
  );
}
