import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getActivePeriod,
  getMySubscriptions,
  getMySkippedDates,
} from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getMyFavorites } from "@/lib/actions/menu";
import { getMyReviews } from "@/lib/actions/review";
import { getPickupStreak } from "@/lib/actions/pickup";
import { getMyPosts } from "@/lib/actions/community";
import { getHolidays } from "@/lib/actions/holiday";
import { countSelectedDays } from "@/lib/utils";
import { expandDeliveryDaysToDateStrings } from "@/lib/delivery-days";
import { MyPageContent } from "./my-page-content";
import type { Subscription, SubscriptionPeriod, Holiday } from "@/types";

type SubscriptionWithPeriod = Subscription & {
  subscription_periods: SubscriptionPeriod | null;
};

export interface SubscriptionWithDetails {
  subscription: Subscription;
  period: SubscriptionPeriod;
  deliveryDayCount: number;
  /** Expanded ISO date strings for all selected delivery dates. */
  deliveryDateStrings: string[];
  /** ISO date strings skipped for a vacation (next-month credit). */
  skippedDates: string[];
  /** ISO date strings skipped as a same-month reschedule (no credit). */
  rescheduledDates: string[];
  /** Holidays that fall within the subscription's delivery period. */
  holidays: Holiday[];
  /** Total number of subscriptions (for "view history" count). */
  totalSubscriptionCount?: number;
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

  // Sort subscriptions newest-first (by period apply_start or created_at)
  const sorted = [...allSubscriptions].sort((a, b) => {
    const pa = (a as SubscriptionWithPeriod).subscription_periods;
    const pb = (b as SubscriptionWithPeriod).subscription_periods;
    const aDate = pa?.apply_start ?? "";
    const bDate = pb?.apply_start ?? "";
    return bDate.localeCompare(aDate);
  });

  // Only build full detail for the most recent subscription; the rest
  // are shown as a count that links to /my/subscriptions.
  const mostRecent = sorted[0];
  const allEntries: SubscriptionWithDetails[] = [];

  if (mostRecent) {
    const subPeriod = (mostRecent as SubscriptionWithPeriod).subscription_periods;
    if (subPeriod) {
      const [days, skippedEntries] = await Promise.all([
        getMyDeliveryDays(mostRecent.id),
        getMySkippedDates(mostRecent.id),
      ]);
      const deliveryDayCount = countSelectedDays(days);
      const deliveryDateStrings = expandDeliveryDaysToDateStrings(days);
      const skippedDates = skippedEntries.filter((e) => !e.isReschedule).map((e) => e.date);
      const rescheduledDates = skippedEntries.filter((e) => e.isReschedule).map((e) => e.date);

      // Fetch holidays for the delivery month
      let holidays: Holiday[] = [];
      if (subPeriod.delivery_start) {
        const d = new Date(subPeriod.delivery_start);
        holidays = await getHolidays(d.getFullYear(), d.getMonth() + 1);
      }

      allEntries.push({
        subscription: mostRecent,
        period: subPeriod,
        deliveryDayCount,
        deliveryDateStrings,
        skippedDates,
        rescheduledDates,
        holidays,
        totalSubscriptionCount: allSubscriptions.length,
      });
    }
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
