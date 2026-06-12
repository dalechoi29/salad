import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getMySubscriptions,
  getMySkippedDatesBySubscriptionIds,
} from "@/lib/actions/subscription";
import { getMyDeliveryDaysBySubscriptionIds } from "@/lib/actions/delivery";
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

  const withPeriod = allSubscriptions.filter(
    (sub) => (sub as SubscriptionWithPeriod).subscription_periods
  );
  const subIds = withPeriod.map((sub) => sub.id);

  // Unique delivery months across all subscriptions, for the holiday lookups.
  const holidayMonths = new Map<string, { year: number; month: number }>();
  for (const sub of withPeriod) {
    const start = (sub as SubscriptionWithPeriod).subscription_periods
      ?.delivery_start;
    if (!start) continue;
    const d = new Date(start);
    holidayMonths.set(`${d.getFullYear()}-${d.getMonth() + 1}`, {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });
  }

  // Two batched queries + cached holiday lookups, all in parallel —
  // replaces the previous per-subscription serial loop.
  const [daysBySub, skippedBySub, holidayResults] = await Promise.all([
    getMyDeliveryDaysBySubscriptionIds(subIds),
    getMySkippedDatesBySubscriptionIds(subIds),
    Promise.all(
      [...holidayMonths.entries()].map(async ([key, { year, month }]) => ({
        key,
        holidays: await getHolidays(year, month),
      }))
    ),
  ]);

  const holidaysByMonth = new Map<string, Holiday[]>(
    holidayResults.map((r) => [r.key, r.holidays])
  );

  const entries: SubscriptionWithDetails[] = withPeriod.map((sub) => {
    const subPeriod = (sub as SubscriptionWithPeriod).subscription_periods!;
    const days = daysBySub[sub.id] ?? [];
    const skippedEntries = skippedBySub[sub.id] ?? [];

    let holidays: Holiday[] = [];
    if (subPeriod.delivery_start) {
      const d = new Date(subPeriod.delivery_start);
      holidays =
        holidaysByMonth.get(`${d.getFullYear()}-${d.getMonth() + 1}`) ?? [];
    }

    return {
      subscription: sub,
      period: subPeriod,
      deliveryDayCount: countSelectedDays(days),
      deliveryDateStrings: expandDeliveryDaysToDateStrings(days),
      skippedDates: skippedEntries.filter((e) => !e.isReschedule).map((e) => e.date),
      rescheduledDates: skippedEntries.filter((e) => e.isReschedule).map((e) => e.date),
      holidays,
    };
  });

  return <SubscriptionsListView subscriptions={entries} />;
}
