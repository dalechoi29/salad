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
import { getMyDeliveryDays } from "@/lib/actions/delivery";
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
  let savedDateStrings: string[] = [];
  let lastPaymentMethod: string | null = null;
  let carryoverReplacement: CarryoverReplacement | null = null;

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
    holidays = [
      ...holidayData.map((h) => h.holiday_date),
      ...storeClosures.map((closure) => closure.closure_date),
    ];
    lastPaymentMethod = lastPm;
    carryoverReplacement = carryover;

    if (sub) {
      const deliveryDays = await getMyDeliveryDays(sub.id);
      savedDateStrings = deliveryDaysToDateStrings(deliveryDays);
    }
  }

  return (
    <SubscriptionView
      period={period}
      existingSubscription={existingSubscription}
      holidays={holidays}
      savedDeliveryDates={savedDateStrings}
      lastPaymentMethod={lastPaymentMethod}
      carryoverReplacement={carryoverReplacement}
    />
  );
}
