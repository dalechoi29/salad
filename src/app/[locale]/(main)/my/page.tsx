import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getActivePeriod,
  getMySubscriptions,
} from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getMyFavorites } from "@/lib/actions/menu";
import { getMyReviews } from "@/lib/actions/review";
import { getPickupStreak } from "@/lib/actions/pickup";
import { getMyPosts } from "@/lib/actions/community";
import { countSelectedDays } from "@/lib/utils";
import { MyPageContent } from "./my-page-content";
import type { Subscription, SubscriptionPeriod } from "@/types";

type SubscriptionWithPeriod = Subscription & {
  subscription_periods: SubscriptionPeriod | null;
};

export interface SubscriptionWithDetails {
  subscription: Subscription;
  period: SubscriptionPeriod;
  deliveryDayCount: number;
}

export default async function MyPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const [period, allSubscriptions] = await Promise.all([
    getActivePeriod(),
    getMySubscriptions(),
  ]);

  const allEntries: SubscriptionWithDetails[] = [];

  for (const sub of allSubscriptions) {
    const subPeriod = (sub as SubscriptionWithPeriod).subscription_periods;
    if (!subPeriod) continue;

    const days = await getMyDeliveryDays(sub.id);
    const deliveryDayCount = countSelectedDays(days);
    allEntries.push({
      subscription: sub,
      period: subPeriod,
      deliveryDayCount,
    });
  }

  const [favorites, reviews, streak, myPosts] = await Promise.all([
    getMyFavorites(),
    getMyReviews(),
    getPickupStreak(),
    getMyPosts(),
  ]);

  return (
    <MyPageContent
      profile={profile}
      period={period}
      subscriptions={allEntries}
      initialFavorites={favorites}
      initialReviews={reviews}
      streak={streak}
      initialPosts={myPosts}
    />
  );
}
