import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { PeriodManagement } from "./period-management";

export default async function AdminSubscriptionsPage() {
  const periods = await getSubscriptionPeriods();

  return <PeriodManagement initialPeriods={periods} />;
}
