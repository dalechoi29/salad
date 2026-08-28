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

type SubscriptionWithPeriod = Subscription & {
  subscription_periods: SubscriptionPeriod | null;
};

function periodOf(sub: Subscription): SubscriptionPeriod | null {
  return (sub as SubscriptionWithPeriod).subscription_periods ?? null;
}

function findSubscriptionForMonth(
  subscriptions: Subscription[],
  monthStart: string,
  monthEnd: string,
  todayStr: string
): Subscription | null {
  const matches: Subscription[] = [];
  for (const sub of subscriptions) {
    const period = periodOf(sub);
    if (!period?.delivery_start || !period?.delivery_end) continue;
    const delStart = period.delivery_start.slice(0, 10);
    const delEnd = period.delivery_end.slice(0, 10);
    if (delStart > monthEnd || delEnd < monthStart) continue;
    // Next-month dates are selectable only after payment is completed.
    if (delStart > todayStr && sub.payment_status !== "completed") continue;
    matches.push(sub);
  }
  return (
    matches.find((s) => s.payment_status === "completed") ??
    matches[0] ??
    null
  );
}

/** Earliest paid period whose delivery window has not started yet. */
function findPaidUpcomingSubscription(
  subscriptions: Subscription[],
  todayStr: string
): Subscription | null {
  const upcoming = subscriptions.filter((sub) => {
    if (sub.payment_status !== "completed") return false;
    const period = periodOf(sub);
    const start = period?.delivery_start?.slice(0, 10);
    return !!start && start > todayStr;
  });
  upcoming.sort((a, b) =>
    (periodOf(a)?.delivery_start ?? "").localeCompare(
      periodOf(b)?.delivery_start ?? ""
    )
  );
  return upcoming[0] ?? null;
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

function resolveMonthRange(
  focusDate: string | undefined,
  paidUpcoming: Subscription | null
): {
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
    const upcomingPeriod = paidUpcoming ? periodOf(paidUpcoming) : null;
    if (upcomingPeriod?.delivery_start && upcomingPeriod.delivery_end) {
      monthStart = new Date(upcomingPeriod.delivery_start.slice(0, 10) + "T00:00:00");
      monthEnd = new Date(upcomingPeriod.delivery_end.slice(0, 10) + "T00:00:00");
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
  }

  return { monthStart, monthEnd, todayStr };
}

/** Fast path: subscription context, week nav, config — no menu assignment rows. */
export async function getMenuPageShellData(
  focusDate?: string
): Promise<MenuPageShellData> {
  const allSubscriptions = await getMySubscriptions();
  const todayStrPreview = formatDateISO(getKSTDate());
  const paidUpcoming = focusDate
    ? null
    : findPaidUpcomingSubscription(allSubscriptions, todayStrPreview);
  const { monthStart, monthEnd, todayStr } = resolveMonthRange(
    focusDate,
    paidUpcoming
  );
  const rangeStart = formatDateISO(monthStart);
  const rangeEnd = formatDateISO(monthEnd);

  const [deliveryDaysBySub, cutoff, weeklyDeadlines, holidays, storeClosures] =
    await Promise.all([
      getMyDeliveryDaysGrouped(),
      getMenuSelectionCutoff(),
      getWeeklyMenuDeadlines(getWeekMondayISO(rangeStart), rangeEnd),
      getHolidays(monthStart.getFullYear()),
      getStoreClosures(monthStart.getFullYear()),
    ]);

  const subscription = findSubscriptionForMonth(
    allSubscriptions,
    rangeStart,
    rangeEnd,
    todayStr
  );
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
