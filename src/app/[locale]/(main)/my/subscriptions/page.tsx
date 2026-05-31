import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getMySubscriptions, getMySkippedDates } from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getHolidays } from "@/lib/actions/holiday";
import { countSelectedDays } from "@/lib/utils";
import { expandDeliveryDaysToDateStrings } from "@/lib/delivery-days";
import { SubscriptionsListView } from "./subscriptions-list-view";
import type { Subscription, SubscriptionPeriod, Holiday } from "@/types";
import type { SubscriptionWithDetails } from "../page";

type SubscriptionWithPeriod = Subscription & {
  subscription_periods: SubscriptionPeriod | null;
};

export default async function SubscriptionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const allSubscriptions = await getMySubscriptions();

  const entries: SubscriptionWithDetails[] = [];

  for (const sub of allSubscriptions) {
    const subPeriod = (sub as SubscriptionWithPeriod).subscription_periods;
    if (!subPeriod) continue;

    const [days, skippedEntries] = await Promise.all([
      getMyDeliveryDays(sub.id),
      getMySkippedDates(sub.id),
    ]);
    const deliveryDayCount = countSelectedDays(days);
    const deliveryDateStrings = expandDeliveryDaysToDateStrings(days);
    const skippedDates = skippedEntries.filter((e) => !e.isReschedule).map((e) => e.date);
    const rescheduledDates = skippedEntries.filter((e) => e.isReschedule).map((e) => e.date);

    let holidays: Holiday[] = [];
    if (subPeriod.delivery_start) {
      const d = new Date(subPeriod.delivery_start);
      holidays = await getHolidays(d.getFullYear(), d.getMonth() + 1);
    }

    entries.push({
      subscription: sub,
      period: subPeriod,
      deliveryDayCount,
      deliveryDateStrings,
      skippedDates,
      rescheduledDates,
      holidays,
    });
  }

  return <SubscriptionsListView subscriptions={entries} />;
}
