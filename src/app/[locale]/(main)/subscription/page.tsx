import {
  getActivePeriod,
  getMySubscription,
  getMyLastPaymentMethod,
  getSubscriptionPeriodById,
} from "@/lib/actions/subscription";
import { getHolidays } from "@/lib/actions/holiday";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { deliveryDaysToDateStrings } from "@/lib/utils";
import { SubscriptionView } from "./subscription-view";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const periodIdParam = params.period;

  let period = periodIdParam
    ? await getSubscriptionPeriodById(periodIdParam)
    : await getActivePeriod();

  const now = new Date();
  let existingSubscription = null;
  let holidays: string[] = [];
  let savedDateStrings: string[] = [];
  let lastPaymentMethod: string | null = null;

  if (period) {
    const [sub, holidayData, lastPm] = await Promise.all([
      getMySubscription(period.id),
      getHolidays(now.getFullYear()),
      getMyLastPaymentMethod(),
    ]);
    existingSubscription = sub;
    holidays = holidayData.map((h) => h.holiday_date);
    lastPaymentMethod = lastPm;

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
    />
  );
}
