import { Suspense } from "react";
import { getMySubscriptions } from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getMenuSelectionCutoff } from "@/lib/actions/admin";
import { getDailyMenus, getMyMenuSelections, getMyFavorites } from "@/lib/actions/menu";
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
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const rangeStart = formatDateISO(monthStart);
  const rangeEnd = formatDateISO(monthEnd);
  const todayStr = formatDateISO(today);

  // If today falls before the month's first weekday, we still want to scope the
  // initial load to the first week of the month.
  const { weekStart: initialWeekStart, weekEnd: initialWeekEnd } =
    getInitialWeekRange(today, rangeStart, rangeEnd);

  // Only load the current week's menu data + selections on the server.
  // Adjacent weeks are lazy-loaded client-side on demand to keep first paint fast.
  const [allSubscriptions, cutoff, initialMenus, initialSelections, initialFavorites] =
    await Promise.all([
      getMySubscriptions(),
      getMenuSelectionCutoff(),
      getDailyMenus(initialWeekStart, initialWeekEnd),
      getMyMenuSelections(initialWeekStart, initialWeekEnd),
      getMyFavorites(),
    ]);

  const subscription = findSubscriptionForMonth(allSubscriptions, rangeStart, rangeEnd);

  let myDeliveryDates: string[] = [];
  const saladsPerDelivery = subscription?.salads_per_delivery ?? 1;
  if (subscription) {
    const days = await getMyDeliveryDays(subscription.id);
    myDeliveryDates = deliveryDaysToDateStrings(days);
  }

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
      initialFavoriteIds={initialFavorites.map((f) => f.menu_id)}
      initialWeekStart={initialWeekStart}
      initialWeekEnd={initialWeekEnd}
    />
  );
}
