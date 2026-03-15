import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getMySubscriptions } from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { countSelectedDays } from "@/lib/utils";
import { SubscriptionsListView } from "./subscriptions-list-view";
import type { Subscription, SubscriptionPeriod } from "@/types";
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

  const entries: SubscriptionWithDetails[] = [];

  for (const sub of allSubscriptions) {
    const subPeriod = (sub as SubscriptionWithPeriod).subscription_periods;
    if (!subPeriod) continue;

    const days = await getMyDeliveryDays(sub.id);
    const deliveryDayCount = countSelectedDays(days);

    entries.push({
      subscription: sub,
      period: subPeriod,
      deliveryDayCount,
    });
  }

  return <SubscriptionsListView subscriptions={entries} />;
}
