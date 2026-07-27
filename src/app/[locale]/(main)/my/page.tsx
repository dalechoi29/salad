import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getMySubscriptions,
  getMySkippedDates,
} from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getMyFavoritesCount } from "@/lib/actions/menu";
import { getMyReviewsCount } from "@/lib/actions/review";
import { getMyPostsCount } from "@/lib/actions/community";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
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
  /** Store closure dates (ISO) within the delivery period. */
  storeClosureDates: string[];
  /** Total number of subscriptions (for "view history" count). */
  totalSubscriptionCount?: number;
}

export default async function MyPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const allSubscriptions = await getMySubscriptions();

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
  const subPeriod = mostRecent
    ? (mostRecent as SubscriptionWithPeriod).subscription_periods
    : null;
  const deliveryStart = subPeriod?.delivery_start
    ? new Date(subPeriod.delivery_start)
    : null;

  // Everything below only needs the subscription id / period — one wave.
  const deliveryYear = deliveryStart?.getFullYear();
  const [days, skippedEntries, holidays, storeClosures, favoritesCount, reviewsCount, postsCount] =
    await Promise.all([
      mostRecent && subPeriod ? getMyDeliveryDays(mostRecent.id) : [],
      mostRecent && subPeriod ? getMySkippedDates(mostRecent.id) : [],
      deliveryYear ? getHolidays(deliveryYear) : ([] as Holiday[]),
      deliveryYear ? getStoreClosures(deliveryYear) : [],
      getMyFavoritesCount(),
      getMyReviewsCount(),
      getMyPostsCount(),
    ]);

  const deliveryStartIso = subPeriod?.delivery_start;
  const deliveryEndIso = subPeriod?.delivery_end;
  const storeClosureDates = storeClosures
    .map((c) => c.closure_date)
    .filter(
      (d) =>
        !deliveryStartIso ||
        !deliveryEndIso ||
        (d >= deliveryStartIso && d <= deliveryEndIso)
    );
  const holidaysInPeriod = holidays.filter(
    (h) =>
      !deliveryStartIso ||
      !deliveryEndIso ||
      (h.holiday_date >= deliveryStartIso && h.holiday_date <= deliveryEndIso)
  );

  const allEntries: SubscriptionWithDetails[] = [];
  if (mostRecent && subPeriod) {
    allEntries.push({
      subscription: mostRecent,
      period: subPeriod,
      deliveryDayCount: countSelectedDays(days),
      deliveryDateStrings: expandDeliveryDaysToDateStrings(days),
      skippedDates: skippedEntries.filter((e) => !e.isReschedule).map((e) => e.date),
      rescheduledDates: skippedEntries.filter((e) => e.isReschedule).map((e) => e.date),
      holidays: holidaysInPeriod,
      storeClosureDates,
      totalSubscriptionCount: allSubscriptions.length,
    });
  }

  return (
    <MyPageContent
      profile={profile}
      subscriptions={allEntries}
      favoritesCount={favoritesCount}
      reviewsCount={reviewsCount}
      streak={profile.pickup_streak ?? 0}
      postsCount={postsCount}
    />
  );
}
