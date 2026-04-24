import { Suspense } from "react";
import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { getHolidays } from "@/lib/actions/holiday";
import {
  getCallerAdminRole,
  getMyPermissions,
  getPeriodSubscribers,
  getSubscriptionDayCounts,
} from "@/lib/actions/admin";
import { getKSTDate } from "@/lib/utils";
import { redirect } from "next/navigation";
import { SubscriptionStatusView } from "./subscription-status-view";

export default async function AdminSubscriptionStatusPage() {
  // Gate the page on the `subscription_status` permission so regular
  // admins without that capability can't land here via a direct URL. The
  // admin landing page already hides the link for them, but the explicit
  // redirect here mirrors the pattern used by /admin/users.
  const [adminRole, permissions] = await Promise.all([
    getCallerAdminRole(),
    getMyPermissions(),
  ]);

  if (
    !adminRole ||
    (adminRole !== "super_admin" && !permissions.includes("subscription_status"))
  ) {
    redirect("/admin");
  }

  const periods = await getSubscriptionPeriods();
  const now = getKSTDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  const currentMonthStr = `${currentYear}년 ${currentMonth}월`;
  const nextMonthStr = `${nextYear}년 ${nextMonth}월`;

  const currentPeriod = periods.find((p) => p.target_month === currentMonthStr);
  const nextPeriod = periods.find((p) => p.target_month === nextMonthStr);

  // Fetching the subscriber lists on the server lets us render the total
  // and paid counts in the collapsed section header on first paint,
  // without waiting for a client-side fetch triggered by expansion.
  const [
    currentCounts,
    nextCounts,
    holidays,
    currentSubscribers,
    nextSubscribers,
  ] = await Promise.all([
    currentPeriod ? getSubscriptionDayCounts(currentPeriod.id) : Promise.resolve({}),
    nextPeriod ? getSubscriptionDayCounts(nextPeriod.id) : Promise.resolve({}),
    getHolidays(),
    currentPeriod ? getPeriodSubscribers(currentPeriod.id) : Promise.resolve([]),
    nextPeriod ? getPeriodSubscribers(nextPeriod.id) : Promise.resolve([]),
  ]);

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
        currentCounts={currentCounts}
        nextCounts={nextCounts}
        holidays={holidays}
        showSubscriberList
        showDateDetailPanel
        autoOpenFirstDataDate
        defaultTabIndex={defaultTabIndex}
        currentSubscribers={currentSubscribers}
        nextSubscribers={nextSubscribers}
      />
    </Suspense>
  );
}
