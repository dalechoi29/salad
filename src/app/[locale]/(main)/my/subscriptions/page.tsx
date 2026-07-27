import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getMySubscriptions,
  getMySkippedDatesBySubscriptionIds,
} from "@/lib/actions/subscription";
import { getMyDeliveryDaysBySubscriptionIds } from "@/lib/actions/delivery";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
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
  const closureYears = new Set<number>();
  for (const sub of withPeriod) {
    const subPeriod = (sub as SubscriptionWithPeriod).subscription_periods;
    const start = subPeriod?.delivery_start;
    const end = subPeriod?.delivery_end;
    if (!start) continue;
    const startDate = new Date(start + "T00:00:00");
    const endDate = end ? new Date(end + "T00:00:00") : startDate;
    closureYears.add(startDate.getFullYear());
    closureYears.add(endDate.getFullYear());
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    while (cur <= endMonth) {
      holidayMonths.set(`${cur.getFullYear()}-${cur.getMonth() + 1}`, {
        year: cur.getFullYear(),
        month: cur.getMonth() + 1,
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // Two batched queries + cached holiday lookups, all in parallel —
  // replaces the previous per-subscription serial loop.
  const [daysBySub, skippedBySub, holidayResults, closureResults] = await Promise.all([
    getMyDeliveryDaysBySubscriptionIds(subIds),
    getMySkippedDatesBySubscriptionIds(subIds),
    Promise.all(
      [...holidayMonths.entries()].map(async ([key, { year, month }]) => ({
        key,
        holidays: await getHolidays(year, month),
      }))
    ),
    Promise.all(
      [...closureYears].map(async (year) => ({
        year,
        closures: await getStoreClosures(year),
      }))
    ),
  ]);

  const holidaysByMonth = new Map<string, Holiday[]>(
    holidayResults.map((r) => [r.key, r.holidays])
  );
  const closuresByYear = new Map(
    closureResults.map((r) => [r.year, r.closures])
  );

  const entries: SubscriptionWithDetails[] = withPeriod.map((sub) => {
    const subPeriod = (sub as SubscriptionWithPeriod).subscription_periods!;
    const days = daysBySub[sub.id] ?? [];
    const skippedEntries = skippedBySub[sub.id] ?? [];

    let holidays: Holiday[] = [];
    let storeClosureDates: string[] = [];
    if (subPeriod.delivery_start) {
      const startDate = new Date(subPeriod.delivery_start + "T00:00:00");
      const endDate = subPeriod.delivery_end
        ? new Date(subPeriod.delivery_end + "T00:00:00")
        : startDate;
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
      const seen = new Set<string>();
      while (cur <= endMonth) {
        const key = `${cur.getFullYear()}-${cur.getMonth() + 1}`;
        for (const h of holidaysByMonth.get(key) ?? []) {
          if (!seen.has(h.id)) {
            seen.add(h.id);
            holidays.push(h);
          }
        }
        cur.setMonth(cur.getMonth() + 1);
      }
      const startIso = subPeriod.delivery_start;
      const endIso = subPeriod.delivery_end ?? startIso;
      holidays = holidays.filter(
        (h) => h.holiday_date >= startIso && h.holiday_date <= endIso
      );
      const closureSet = new Set<string>();
      for (let y = startDate.getFullYear(); y <= endDate.getFullYear(); y++) {
        for (const c of closuresByYear.get(y) ?? []) {
          if (
            c.closure_date >= startIso &&
            c.closure_date <= endIso
          ) {
            closureSet.add(c.closure_date);
          }
        }
      }
      storeClosureDates = [...closureSet].sort();
    }

    return {
      subscription: sub,
      period: subPeriod,
      deliveryDayCount: countSelectedDays(days),
      deliveryDateStrings: expandDeliveryDaysToDateStrings(days),
      skippedDates: skippedEntries.filter((e) => !e.isReschedule).map((e) => e.date),
      rescheduledDates: skippedEntries.filter((e) => e.isReschedule).map((e) => e.date),
      holidays,
      storeClosureDates,
    };
  });

  return <SubscriptionsListView subscriptions={entries} />;
}
