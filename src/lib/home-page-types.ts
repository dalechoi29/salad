import type { MenuDetail } from "@/lib/menu-display-utils";
import type { DailyMenu, DailySaladStatus, MenuSelection, Subscription, SubscriptionPeriod } from "@/types";

export type HomeStripData = {
  menuDetailByDate: Record<string, MenuDetail[]>;
  availableMenusByDate: Record<string, MenuDetail[]>;
  guestBrowseMenusByDate: Record<string, MenuDetail[]>;
};

export type HomePageShellData = {
  isLoggedIn: boolean;
  isAdmin: boolean;
  nickname: string;
  period: SubscriptionPeriod | null;
  subscription: Subscription | null;
  periodSubscription: Subscription | null;
  todayMenus: DailyMenu[];
  isMyDeliveryDay: boolean;
  deliveryDayCount: number;
  todayStr: string;
  todayConfirmed: boolean;
  nextDeliveryDate: string | null;
  todaySelectedMenuName: string | null;
  saladStatus: DailySaladStatus | null;
  currentUserName: string;
  needsMoreDeliveryDates: boolean;
  remainingDeliverySlots: number;
  hasStoreClosureInActivePeriod: boolean;
  myDeliveryDates: string[];
  loggedInStripDates: string[];
  guestStripDates: string[];
  selectedDatesInPeriod: string[];
  stripSelections: MenuSelection[];
  cutoffDay: number;
  cutoffTime: string;
};

export function shellToHomeContentProps(shell: HomePageShellData) {
  return {
    isLoggedIn: shell.isLoggedIn,
    isAdmin: shell.isAdmin,
    nickname: shell.nickname,
    period: shell.period,
    subscription: shell.subscription,
    periodSubscription: shell.periodSubscription,
    todayMenus: shell.todayMenus,
    isMyDeliveryDay: shell.isMyDeliveryDay,
    deliveryDayCount: shell.deliveryDayCount,
    todayStr: shell.todayStr,
    todayConfirmed: shell.todayConfirmed,
    nextDeliveryDate: shell.nextDeliveryDate,
    todaySelectedMenuName: shell.todaySelectedMenuName,
    saladStatus: shell.saladStatus,
    currentUserName: shell.currentUserName,
    needsMoreDeliveryDates: shell.needsMoreDeliveryDates,
    remainingDeliverySlots: shell.remainingDeliverySlots,
    hasStoreClosureInActivePeriod: shell.hasStoreClosureInActivePeriod,
    myDeliveryDates: shell.myDeliveryDates,
    loggedInStripDates: shell.loggedInStripDates,
    guestStripDates: shell.guestStripDates,
    selectedDatesInPeriod: shell.selectedDatesInPeriod,
    cutoffDay: shell.cutoffDay,
    cutoffTime: shell.cutoffTime,
  };
}

export type HomeStripLoaderParams = {
  isLoggedIn: boolean;
  loggedInStripDates: string[];
  guestStripDates: string[];
  stripSelections: MenuSelection[];
};
