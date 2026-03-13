import { getDashboardStats } from "@/lib/actions/admin";
import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { DashboardView } from "./dashboard-view";

export default async function AdminDashboardPage() {
  const [stats, periods] = await Promise.all([
    getDashboardStats(),
    getSubscriptionPeriods(),
  ]);

  return <DashboardView initialStats={stats} periods={periods} />;
}
