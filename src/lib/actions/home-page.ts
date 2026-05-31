"use server";

import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getActivePeriod,
  getMySubscription,
  getMySubscriptions,
} from "@/lib/actions/subscription";
import { getMyDeliveryDaysGrouped } from "@/lib/actions/delivery";
import {
  deliveryDaysToDateStrings,
  getTodayStr,
  getKSTDate,
  countSelectedDays,
} from "@/lib/utils";
import {
  getDailyMenusByDate,
  getDailyMenus,
  getMyMenuSelectionsSummary,
} from "@/lib/actions/menu";
import { getMyPickups } from "@/lib/actions/pickup";
import { getDailySaladStatus, getMenuSelectionCutoff } from "@/lib/actions/admin";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import {
  buildAvailableMenusByDate,
  buildMenuDetailByDate,
} from "@/lib/menu-display-utils";
import {
  excludeBlockedDates,
  findCurrentSubscription,
  getEffectiveTotalDays,
  getGuestStripWeekdays,
  hasClosureInPeriod,
  type SubscriptionWithPeriod,
} from "@/lib/home-page-utils";
import type { HomePageShellData, HomeStripData } from "@/lib/home-page-types";
import type { MenuSelection, Subscription } from "@/types";

export type { HomePageShellData, HomeStripData } from "@/lib/home-page-types";

/** Fast path: layout, dates, CTAs — no daily menu rows for the delivery strip. */
export async function getHomePageShellData(): Promise<HomePageShellData> {
  const todayStr = getTodayStr();
  const kstNow = getKSTDate();
  const isWeekday = kstNow.getDay() >= 1 && kstNow.getDay() <= 5;

  const [
    profile,
    period,
    allSubscriptions,
    todayMenus,
    todayPickups,
    todaySelections,
    saladStatus,
    cutoff,
    deliveryDaysBySub,
    storeClosures,
  ] = await Promise.all([
    getCurrentProfile(),
    getActivePeriod(),
    getMySubscriptions(),
    isWeekday ? getDailyMenusByDate(todayStr) : [],
    isWeekday ? getMyPickups(todayStr, todayStr) : [],
    isWeekday ? getMyMenuSelectionsSummary(todayStr, todayStr) : [],
    isWeekday ? getDailySaladStatus(todayStr) : null,
    getMenuSelectionCutoff(),
    getMyDeliveryDaysGrouped(),
    getStoreClosures(),
  ]);

  const subscription = findCurrentSubscription(allSubscriptions, todayStr);
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const periodSubscription = period ? await getMySubscription(period.id) : null;

  const incompleteClosureCandidates = (
    allSubscriptions as SubscriptionWithPeriod[]
  )
    .map((sub) => {
      const subPeriod = sub.subscription_periods;
      return { sub, subPeriod };
    })
    .filter(
      ({ sub, subPeriod }) =>
        sub.payment_status === "completed" &&
        hasClosureInPeriod(subPeriod, storeClosures)
    )
    .sort((a, b) =>
      (a.subPeriod?.delivery_start ?? "").localeCompare(
        b.subPeriod?.delivery_start ?? ""
      )
    );

  const deliveryDays = subscription
    ? (deliveryDaysBySub[subscription.id] ?? [])
    : [];
  const periodDeliveryDays = periodSubscription
    ? (deliveryDaysBySub[periodSubscription.id] ?? [])
    : [];

  let needsMoreDeliveryDates = false;
  let remainingDeliverySlots = 0;
  let hasStoreClosureInActivePeriod = false;

  for (const { sub } of incompleteClosureCandidates) {
    const candidateDays =
      sub.id === subscription?.id
        ? deliveryDays
        : sub.id === periodSubscription?.id
          ? periodDeliveryDays
          : (deliveryDaysBySub[sub.id] ?? []);
    const selectedCount = countSelectedDays(candidateDays);
    const usedCarryoverDays = (allSubscriptions as Subscription[]).reduce(
      (sum, other) =>
        other.carryover_from_subscription_id === sub.id
          ? sum + ((other.carryover_delivery_days ?? 0) as number)
          : sum,
      0
    );
    const remaining = Math.max(
      0,
      getEffectiveTotalDays(sub) - selectedCount - usedCarryoverDays
    );
    const isClosureReplacement =
      sub.closure_reselection_required === true || selectedCount > 0;

    if (remaining > 0 && isClosureReplacement) {
      needsMoreDeliveryDates = true;
      remainingDeliverySlots = remaining;
      hasStoreClosureInActivePeriod = true;
      break;
    }
  }

  if (!needsMoreDeliveryDates && periodSubscription?.payment_status === "completed") {
    const effectiveTotal = getEffectiveTotalDays(periodSubscription);
    const selectedCount = countSelectedDays(periodDeliveryDays);
    remainingDeliverySlots = Math.max(0, effectiveTotal - selectedCount);
    needsMoreDeliveryDates = remainingDeliverySlots > 0;
    hasStoreClosureInActivePeriod = false;
  }

  let deliveryDayCount = 0;
  let nextDeliveryDate: string | null = null;
  let isMyDeliveryDay = false;
  let myDeliveryDates: string[] = [];
  let bestSub: SubscriptionWithPeriod | null = null;

  if (subscription && deliveryDays.length > 0) {
    deliveryDayCount = countSelectedDays(deliveryDays);
    const currentSubDates = deliveryDaysToDateStrings(deliveryDays);
    isMyDeliveryDay = new Set(currentSubDates).has(todayStr);

    bestSub = subscription as SubscriptionWithPeriod;
    let bestDates = currentSubDates;

    for (const sub of allSubscriptions as SubscriptionWithPeriod[]) {
      const dates = deliveryDaysToDateStrings(deliveryDaysBySub[sub.id] ?? []);
      const futureCnt = dates.filter((d) => d >= todayStr).length;
      const bestFutureCnt = bestDates.filter((d) => d >= todayStr).length;
      if (futureCnt > bestFutureCnt) {
        bestSub = sub;
        bestDates = dates;
      }
    }
    myDeliveryDates = bestDates;

    const futureDates = myDeliveryDates.filter((d) => d > todayStr);
    if (futureDates.length > 0) nextDeliveryDate = futureDates[0];
  }

  let loggedInStripDates: string[] = [];
  let guestStripDates: string[] = [];

  const rawGuestDates = getGuestStripWeekdays(todayStr);
  const holidayYears = new Set([
    ...myDeliveryDates.map((d) => new Date(d + "T00:00:00").getFullYear()),
    ...rawGuestDates.map((d) => new Date(d + "T00:00:00").getFullYear()),
  ]);
  const holidayRows =
    holidayYears.size > 0
      ? (await Promise.all([...holidayYears].map((y) => getHolidays(y)))).flat()
      : [];

  loggedInStripDates = excludeBlockedDates(
    myDeliveryDates,
    holidayRows,
    storeClosures
  );

  if (!profile) {
    guestStripDates = excludeBlockedDates(rawGuestDates, holidayRows, storeClosures);
  }

  const stripStart = bestSub?.subscription_periods?.delivery_start?.slice(0, 10);
  const stripEnd = bestSub?.subscription_periods?.delivery_end?.slice(0, 10);

  const stripSelections =
    stripStart && stripEnd
      ? await getMyMenuSelectionsSummary(stripStart, stripEnd)
      : [];

  const selectedDatesInPeriod =
    stripSelections.length > 0
      ? [...new Set(stripSelections.map((s) => s.delivery_date))]
      : [];

  const todayConfirmed = todayPickups.some((p) => p.confirmed);

  const todaySelectedMenuName =
    todaySelections.length > 0
      ? todayMenus.find((dm) => dm.id === todaySelections[0].daily_menu_id)?.menu
          ?.title ?? null
      : null;

  return {
    isLoggedIn: !!profile,
    isAdmin,
    nickname: profile?.nickname ?? "",
    period,
    subscription,
    periodSubscription,
    todayMenus: isWeekday ? todayMenus : [],
    isMyDeliveryDay,
    deliveryDayCount,
    todayStr,
    todayConfirmed,
    nextDeliveryDate,
    todaySelectedMenuName,
    saladStatus,
    currentUserName: profile?.real_name ?? "",
    needsMoreDeliveryDates,
    remainingDeliverySlots,
    hasStoreClosureInActivePeriod,
    myDeliveryDates,
    loggedInStripDates,
    guestStripDates,
    selectedDatesInPeriod,
    stripSelections,
    cutoffDay: cutoff.day,
    cutoffTime: cutoff.time,
  };
}

/** Slow path: daily menu rows for the delivery strip preview. */
export async function getHomeStripData(
  isLoggedIn: boolean,
  loggedInStripDates: string[],
  guestStripDates: string[],
  stripSelections: MenuSelection[]
): Promise<HomeStripData> {
  const [stripDailyMenus, guestDailyMenus] = await Promise.all([
    isLoggedIn && loggedInStripDates.length > 0
      ? getDailyMenus(
          loggedInStripDates[0],
          loggedInStripDates[loggedInStripDates.length - 1]
        )
      : Promise.resolve([]),
    !isLoggedIn && guestStripDates.length > 0
      ? getDailyMenus(guestStripDates[0], guestStripDates[guestStripDates.length - 1])
      : Promise.resolve([]),
  ]);

  let menuDetailByDate: HomeStripData["menuDetailByDate"] = {};
  let availableMenusByDate: HomeStripData["availableMenusByDate"] = {};

  if (stripSelections.length > 0 || stripDailyMenus.length > 0) {
    const loggedInStripSet = new Set(loggedInStripDates);
    menuDetailByDate = buildMenuDetailByDate(
      stripSelections,
      stripDailyMenus,
      loggedInStripSet
    );
    availableMenusByDate = buildAvailableMenusByDate(stripDailyMenus);
  }

  const guestBrowseMenusByDate =
    guestDailyMenus.length > 0
      ? buildAvailableMenusByDate(guestDailyMenus)
      : {};

  return { menuDetailByDate, availableMenusByDate, guestBrowseMenusByDate };
}
