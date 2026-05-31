import type { DailyMenu, MenuSelection } from "@/types";

export type MenuPageShellData = {
  deliveryStart: string;
  deliveryEnd: string;
  myDeliveryDates: string[];
  todayStr: string;
  cutoffDay: number;
  cutoffTime: string;
  saladsPerDelivery: number;
  initialWeekStart: string;
  initialWeekEnd: string;
  initialWeekMonday: string;
  initialFocusDate?: string;
  blockedDates: string[];
  deadlineOverrides: Record<string, string>;
  /** Dates in the opened week (for skeleton placeholders). */
  initialWeekDates: string[];
};

export type MenuPageWeekData = {
  menus: DailyMenu[];
  selections: MenuSelection[];
};

export function shellToViewProps(shell: MenuPageShellData) {
  return {
    deliveryStart: shell.deliveryStart,
    deliveryEnd: shell.deliveryEnd,
    myDeliveryDates: shell.myDeliveryDates,
    todayStr: shell.todayStr,
    cutoffDay: shell.cutoffDay,
    cutoffTime: shell.cutoffTime,
    saladsPerDelivery: shell.saladsPerDelivery,
    initialWeekStart: shell.initialWeekStart,
    initialWeekEnd: shell.initialWeekEnd,
    initialFocusDate: shell.initialFocusDate,
    blockedDates: shell.blockedDates,
    deadlineOverrides: shell.deadlineOverrides,
    initialWeekMonday: shell.initialWeekMonday,
  };
}
