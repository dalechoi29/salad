import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { getHolidays } from "@/lib/actions/holiday";
import { getSubscriptionDayCounts } from "@/lib/actions/admin";
import { SubscriptionStatusView } from "./subscription-status-view";

export default async function AdminSubscriptionStatusPage() {
  const periods = await getSubscriptionPeriods();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  const currentMonthStr = `${currentYear}년 ${currentMonth}월`;
  const nextMonthStr = `${nextYear}년 ${nextMonth}월`;

  const currentPeriod = periods.find((p) => p.target_month === currentMonthStr);
  const nextPeriod = periods.find((p) => p.target_month === nextMonthStr);

  const [currentCounts, nextCounts, holidays] = await Promise.all([
    currentPeriod ? getSubscriptionDayCounts(currentPeriod.id) : Promise.resolve({}),
    nextPeriod ? getSubscriptionDayCounts(nextPeriod.id) : Promise.resolve({}),
    getHolidays(),
  ]);

  return (
    <SubscriptionStatusView
      currentPeriod={currentPeriod ?? null}
      nextPeriod={nextPeriod ?? null}
      currentCounts={currentCounts}
      nextCounts={nextCounts}
      holidays={holidays}
      isAdmin
    />
  );
}
