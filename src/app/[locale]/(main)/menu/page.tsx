import { getMySubscriptions } from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { deliveryDaysToDateStrings, formatDateISO } from "@/lib/utils";
import { MenuSelectionView } from "./menu-selection-view";
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

export default async function MenuPage() {
  const allSubscriptions = await getMySubscriptions();

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const rangeStart = formatDateISO(monthStart);
  const rangeEnd = formatDateISO(monthEnd);
  const todayStr = formatDateISO(today);

  const subscription = findSubscriptionForMonth(allSubscriptions, rangeStart, rangeEnd);

  let myDeliveryDates: string[] = [];
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
    />
  );
}
