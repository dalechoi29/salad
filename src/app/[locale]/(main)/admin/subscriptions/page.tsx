import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { getHolidays } from "@/lib/actions/holiday";
import { PeriodManagement } from "./period-management";

export default async function AdminSubscriptionsPage() {
  const [periods, holidays] = await Promise.all([
    getSubscriptionPeriods(),
    getHolidays(),
  ]);

  return (
    <PeriodManagement
      initialPeriods={periods}
      holidays={holidays.map((h) => h.date)}
    />
  );
}
