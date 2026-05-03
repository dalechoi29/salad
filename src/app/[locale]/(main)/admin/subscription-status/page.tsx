import { Suspense } from "react";
import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import {
  getCallerAdminRole,
  getMyPermissions,
  getPeriodStatusBundle,
  type PeriodStatusBundle,
} from "@/lib/actions/admin";
import { getKSTDate } from "@/lib/utils";
import { redirect } from "next/navigation";
import { SubscriptionStatusView } from "./subscription-status-view";

const EMPTY_BUNDLE: PeriodStatusBundle = { dayCounts: {}, subscribers: [] };

export default async function AdminSubscriptionStatusPage() {
  // Gate the page on the `subscription_status` permission so regular
  // admins without that capability can't land here via a direct URL. The
  // admin landing page already hides the link for them, but the explicit
  // redirect here mirrors the pattern used by /admin/users.
  const [adminRole, permissions, periods] = await Promise.all([
    getCallerAdminRole(),
    getMyPermissions(),
    getSubscriptionPeriods(),
  ]);

  if (
    !adminRole ||
    (adminRole !== "super_admin" && !permissions.includes("subscription_status"))
  ) {
    redirect("/admin");
  }

  const now = getKSTDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  const currentMonthStr = `${currentYear}년 ${currentMonth}월`;
  const nextMonthStr = `${nextYear}년 ${nextMonth}월`;

  const currentPeriod = periods.find((p) => p.target_month === currentMonthStr);
  const nextPeriod = periods.find((p) => p.target_month === nextMonthStr);

  const yearsForBlocked = [...new Set([currentYear, nextYear])];

  // One combined fetch per period (counts + roster share subscriptions /
  // delivery_days). Holidays and closures are scoped to the calendar year(s)
  // that can appear on the two tabs instead of loading all history.
  const [currentBundle, nextBundle, holidaysByYear, closuresByYear] =
    await Promise.all([
      currentPeriod
        ? getPeriodStatusBundle(currentPeriod.id)
        : Promise.resolve(EMPTY_BUNDLE),
      nextPeriod
        ? getPeriodStatusBundle(nextPeriod.id)
        : Promise.resolve(EMPTY_BUNDLE),
      Promise.all(yearsForBlocked.map((y) => getHolidays(y))),
      Promise.all(yearsForBlocked.map((y) => getStoreClosures(y))),
    ]);

  const holidays = holidaysByYear.flat();
  const storeClosures = closuresByYear.flat();

  const blockedDays = [
    ...holidays,
    ...storeClosures.map((closure) => ({
      id: closure.id,
      holiday_date: closure.closure_date,
      name: closure.reason || "매장 휴무",
      source: "store_closure" as const,
    })),
  ];

  // Default tab: once the current month's payment window has closed, focus
  // the admin on whichever period is still actionable. Concretely, if
  // `currentPeriod.pay_end` is already in the past and a next period
  // exists, pre-select the next-month tab. We compare real UTC epochs so
  // we don't depend on the quirky KST offset produced by `getKSTDate`.
  const nowMs = Date.now();
  const currentPayEndMs = currentPeriod?.pay_end
    ? new Date(currentPeriod.pay_end).getTime()
    : Number.POSITIVE_INFINITY;
  const currentPayClosed = currentPayEndMs <= nowMs;
  const defaultTabIndex =
    currentPayClosed && nextPeriod ? 1 : 0;

  return (
    // The view reads `?date=…` via `useSearchParams`, which Next.js requires
    // to be wrapped in a Suspense boundary so only this subtree opts into
    // CSR bailout rather than the whole page. The fallback is intentionally
    // empty — initial server-rendered markup is already fast to paint.
    <Suspense fallback={null}>
      <SubscriptionStatusView
        currentPeriod={currentPeriod ?? null}
        nextPeriod={nextPeriod ?? null}
        currentCounts={currentBundle.dayCounts}
        nextCounts={nextBundle.dayCounts}
        holidays={blockedDays}
        showSubscriberList
        showDateDetailPanel
        autoOpenFirstDataDate
        defaultTabIndex={defaultTabIndex}
        currentSubscribers={currentBundle.subscribers}
        nextSubscribers={nextBundle.subscribers}
      />
    </Suspense>
  );
}
