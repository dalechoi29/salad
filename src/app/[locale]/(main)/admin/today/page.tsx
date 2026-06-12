import {
  getTodaySaladSummary,
  getDailySaladStatus,
  getCompanyUsers,
} from "@/lib/actions/admin";
import { formatDateISO, getKSTDate } from "@/lib/utils";
import { TodaySaladView } from "./today-salad-view";

export default async function AdminTodaySaladPage() {
  // Server-render today's data so the page paints without a spinner.
  const todayStr = formatDateISO(getKSTDate());
  const [summary, status, companyUsers] = await Promise.all([
    getTodaySaladSummary(),
    getDailySaladStatus(todayStr),
    getCompanyUsers(),
  ]);

  return (
    <TodaySaladView
      initialSummary={summary}
      initialStatus={status}
      initialCompanyUsers={companyUsers}
    />
  );
}
