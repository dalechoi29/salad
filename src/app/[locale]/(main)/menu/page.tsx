import { Suspense } from "react";
import { getMySubscriptions } from "@/lib/actions/subscription";
import { getMyDeliveryDaysBySubscriptionIds } from "@/lib/actions/delivery";
import {
  getMenuSelectionCutoff,
  getWeeklyMenuDeadlines,
} from "@/lib/actions/admin";
import { getDailyMenus, getMyMenuSelections, getMyFavoriteIds } from "@/lib/actions/menu";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { deliveryDaysToDateStrings, formatDateISO, getKSTDate } from "@/lib/utils";
import { MenuSelectionView } from "./menu-selection-view";
import { MenuSkeleton } from "./menu-skeleton";
import type { Subscription, SubscriptionPeriod } from "@/types";

function findSubscriptionForMonth(
  subscriptions: Subscription[],
  monthStart: string,
  monthEnd: string
): Subscription | null {
  for (const sub of subscriptions) {
    const period = (sub as Subscription & { subscription_periods: SubscriptionPeriod })
      .subscription_periods;
    if (!period?.delivery_start || !period?.delivery_end) continue;
    const delStart = period.delivery_start.slice(0, 10);
    const delEnd = period.delivery_end.slice(0, 10);
    if (delStart <= monthEnd && delEnd >= monthStart) {
      return sub;
    }
  }
  return subscriptions[0] ?? null;
}

// Monday of the week containing `date` (KST wall clock). Returns ISO string.
function getWeekMondayISO(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return formatDateISO(d);
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

function isInLastWeekOfMonth(date: Date): boolean {
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lastWeekMonday = new Date(monthEnd);
  const dow = lastWeekMonday.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  lastWeekMonday.setDate(lastWeekMonday.getDate() - diff);
  lastWeekMonday.setHours(0, 0, 0, 0);
  return date >= lastWeekMonday;
}

// Clamp the initial week to the month range so we don't accidentally request
// rows outside the schedule.
function getInitialWeekRange(
  today: Date,
  rangeStart: string,
  rangeEnd: string
): { weekStart: string; weekEnd: string } {
  const mondayIfTodayInMonth = getWeekMondayISO(today);
  const weekStart =
    mondayIfTodayInMonth < rangeStart ? rangeStart : mondayIfTodayInMonth;
  const weekEndCandidate = addDaysISO(weekStart, 4); // Mon→Fri
  const weekEnd = weekEndCandidate > rangeEnd ? rangeEnd : weekEndCandidate;
  return { weekStart, weekEnd };
}

export default function MenuPage() {
  return (
    <Suspense fallback={<MenuSkeleton />}>
      <MenuPageContent />
    </Suspense>
  );
}

async function MenuPageContent() {
  const today = getKSTDate();
  // During the last week of a month, users need to pick menus for the
  // following week's deliveries, which often belong to the next month.
  // Switch the /menu workflow to next month from the Monday of the current
  // month's final week so those next-month delivery dates become selectable.
  const targetMonthOffset = isInLastWeekOfMonth(today) ? 1 : 0;
  const monthStart = new Date(
    today.getFullYear(),
    today.getMonth() + targetMonthOffset,
    1
  );
  const monthEnd = new Date(
    today.getFullYear(),
    today.getMonth() + targetMonthOffset + 1,
    0
  );

  const rangeStart = formatDateISO(monthStart);
  const rangeEnd = formatDateISO(monthEnd);
  const todayStr = formatDateISO(today);

  // If today falls before the month's first weekday, we still want to scope the
  // initial load to the first week of the month.
  const { weekStart: initialWeekStart, weekEnd: initialWeekEnd } =
    getInitialWeekRange(today, rangeStart, rangeEnd);

  // Only load the current week's menu data + selections on the server.
  // Adjacent weeks are lazy-loaded client-side on demand to keep first paint fast.
  const [allSubscriptions, cutoff, weeklyDeadlines, initialMenus, initialSelections, initialFavorites, holidays, storeClosures] =
    await Promise.all([
      getMySubscriptions(),
      getMenuSelectionCutoff(),
      getWeeklyMenuDeadlines(getWeekMondayISO(monthStart), rangeEnd),
      getDailyMenus(initialWeekStart, initialWeekEnd),
      getMyMenuSelections(initialWeekStart, initialWeekEnd),
      getMyFavoriteIds(),
      getHolidays(monthStart.getFullYear()),
      getStoreClosures(monthStart.getFullYear()),
    ]);

  const subscription = findSubscriptionForMonth(allSubscriptions, rangeStart, rangeEnd);

  const saladsPerDelivery = subscription?.salads_per_delivery ?? 1;
  const deliveryDaysBySub = subscription
    ? await getMyDeliveryDaysBySubscriptionIds([subscription.id])
    : {};
  const myDeliveryDates = subscription
    ? deliveryDaysToDateStrings(deliveryDaysBySub[subscription.id] ?? [])
    : [];
  const blockedDates = [
    ...holidays.map((h) => h.holiday_date),
    ...storeClosures.map((c) => c.closure_date),
  ];

  return (
    <MenuSelectionView
      deliveryStart={rangeStart}
      deliveryEnd={rangeEnd}
      myDeliveryDates={myDeliveryDates}
      todayStr={todayStr}
      cutoffDay={cutoff.day}
      cutoffTime={cutoff.time}
      saladsPerDelivery={saladsPerDelivery}
      initialMenus={initialMenus}
      initialSelections={initialSelections}
      initialFavoriteIds={initialFavorites}
      initialWeekStart={initialWeekStart}
      initialWeekEnd={initialWeekEnd}
      blockedDates={blockedDates}
      deadlineOverrides={Object.fromEntries(
        weeklyDeadlines.map((d) => [d.week_start, d.deadline_at])
      )}
    />
  );
}
