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
import { getKSTDate, formatDateISO } from "@/lib/utils";
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
  const todayStr = formatDateISO(now);

  // Primary: exact target_month string match (e.g. "2026년 5월").
  // Fallback: date-range match in case the period's target_month was entered
  // with a different format (e.g. "2026년 05월"). Mirrors the logic in
  // getActivePeriod() which other pages rely on.
  const currentPeriod =
    periods.find((p) => p.target_month === currentMonthStr) ??
    periods.find(
      (p) =>
        p.delivery_start != null &&
        p.delivery_end != null &&
        p.delivery_start.slice(0, 10) <= todayStr &&
        p.delivery_end.slice(0, 10) >= todayStr
    ) ??
    null;

  const nextPeriod =
    periods.find((p) => p.target_month === nextMonthStr) ??
    periods
      .filter(
        (p) =>
          p !== currentPeriod &&
          p.delivery_start != null &&
          p.delivery_start.slice(0, 10) > todayStr
      )
      .sort((a, b) =>
        (a.delivery_start ?? "").localeCompare(b.delivery_start ?? "")
      )[0] ??
    null;

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

  // Default tab: stay on the current period while deliveries are still
  // running (even after the payment window closes). Only switch to the
  // next-month tab once the current period's delivery window has fully
  // ended, so the admin always lands on the month being delivered today.
  const nowMs = Date.now();
  const currentDeliveryEndMs = currentPeriod?.delivery_end
    ? new Date(currentPeriod.delivery_end + "T23:59:59+09:00").getTime()
    : Number.POSITIVE_INFINITY;
  const currentDeliveryEnded = currentDeliveryEndMs < nowMs;
  const defaultTabIndex =
    currentDeliveryEnded && nextPeriod ? 1 : 0;

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
