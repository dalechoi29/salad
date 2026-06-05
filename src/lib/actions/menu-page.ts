"use server";

import { getMySubscriptions } from "@/lib/actions/subscription";
import { getMyDeliveryDaysGrouped } from "@/lib/actions/delivery";
import {
  getMenuSelectionCutoff,
  getWeeklyMenuDeadlines,
} from "@/lib/actions/admin";
import { getDailyMenus, getMyMenuSelectionsSummary } from "@/lib/actions/menu";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { deliveryDaysToDateStrings, formatDateISO, getKSTDate } from "@/lib/utils";
import {
  getWeekMondayISO,
  resolveInitialWeekMonday,
  getWeekRange,
} from "@/lib/menu-week-utils";
import type { MenuSelection, Subscription, SubscriptionPeriod } from "@/types";
import type { MenuPageShellData, MenuPageWeekData } from "@/lib/menu-page-types";

export type { MenuPageShellData, MenuPageWeekData } from "@/lib/menu-page-types";

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

function isInLastWeekOfMonth(date: Date): boolean {
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lastWeekMonday = new Date(monthEnd);
  const dow = lastWeekMonday.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  lastWeekMonday.setDate(lastWeekMonday.getDate() - diff);
  lastWeekMonday.setHours(0, 0, 0, 0);
  return date >= lastWeekMonday;
}

function resolveMonthRange(focusDate?: string): {
  monthStart: Date;
  monthEnd: Date;
  todayStr: string;
} {
  const today = getKSTDate();
  const todayStr = formatDateISO(today);
  const anchor = focusDate
    ? new Date(focusDate + "T00:00:00")
    : today;

  let monthStart: Date;
  let monthEnd: Date;

  if (focusDate) {
    monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  } else {
    const targetMonthOffset = isInLastWeekOfMonth(today) ? 1 : 0;
    monthStart = new Date(
      today.getFullYear(),
      today.getMonth() + targetMonthOffset,
      1
    );
    monthEnd = new Date(
      today.getFullYear(),
      today.getMonth() + targetMonthOffset + 1,
      0
    );
  }

  return { monthStart, monthEnd, todayStr };
}

/** Fast path: subscription context, week nav, config — no menu assignment rows. */
export async function getMenuPageShellData(
  focusDate?: string
): Promise<MenuPageShellData> {
  const { monthStart, monthEnd, todayStr } = resolveMonthRange(focusDate);
  const rangeStart = formatDateISO(monthStart);
  const rangeEnd = formatDateISO(monthEnd);

  const [allSubscriptions, deliveryDaysBySub, cutoff, weeklyDeadlines, holidays, storeClosures] =
    await Promise.all([
      getMySubscriptions(),
      getMyDeliveryDaysGrouped(),
      getMenuSelectionCutoff(),
      getWeeklyMenuDeadlines(getWeekMondayISO(rangeStart), rangeEnd),
      getHolidays(monthStart.getFullYear()),
      getStoreClosures(monthStart.getFullYear()),
    ]);

  const subscription = findSubscriptionForMonth(allSubscriptions, rangeStart, rangeEnd);
  const myDeliveryDates = subscription
    ? deliveryDaysToDateStrings(deliveryDaysBySub[subscription.id] ?? [])
    : [];
  const blockedDates = [
    ...holidays.map((h) => h.holiday_date),
    ...storeClosures.map((c) => c.closure_date),
  ];

  const initialWeekMonday = resolveInitialWeekMonday({
    deliveryStart: rangeStart,
    deliveryEnd: rangeEnd,
    myDeliveryDates,
    blockedDates,
    todayStr,
    initialFocusDate: focusDate,
  });
  const { weekStart: initialWeekStart, weekEnd: initialWeekEnd } = getWeekRange(
    initialWeekMonday,
    rangeStart,
    rangeEnd
  );

  const initialWeekDates: string[] = [];
  const cursor = new Date(initialWeekStart + "T00:00:00");
  const weekEndDate = new Date(initialWeekEnd + "T00:00:00");
  while (cursor <= weekEndDate) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      initialWeekDates.push(formatDateISO(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    deliveryStart: rangeStart,
    deliveryEnd: rangeEnd,
    myDeliveryDates,
    todayStr,
    cutoffDay: cutoff.day,
    cutoffTime: cutoff.time,
    saladsPerDelivery: subscription?.salads_per_delivery ?? 1,
    initialWeekStart,
    initialWeekEnd,
    initialWeekMonday,
    initialFocusDate: focusDate,
    blockedDates,
    deadlineOverrides: Object.fromEntries(
      weeklyDeadlines.map((d) => [d.week_start, d.deadline_at])
    ),
    initialWeekDates,
  };
}

/** Menu assignments for one week (lazy-loaded when navigating weeks). */
export async function getMenuPageWeekData(
  weekStart: string,
  weekEnd: string
): Promise<MenuPageWeekData> {
  const menus = await getDailyMenus(weekStart, weekEnd);
  return { menus, selections: [] };
}

/** All selections in the visible period — powers chips + progress bar on first paint. */
export async function getMenuPagePeriodSelections(
  deliveryStart: string,
  deliveryEnd: string
): Promise<MenuSelection[]> {
  return getMyMenuSelectionsSummary(deliveryStart, deliveryEnd);
}
