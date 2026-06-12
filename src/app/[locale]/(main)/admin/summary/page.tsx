import { getDeliverySummary } from "@/lib/actions/admin";
import { getKSTDate, getMonthRange } from "@/lib/utils";
import { DeliverySummaryView } from "./delivery-summary-view";

export default async function AdminSummaryPage() {
  // Server-render the current month so the page paints with data instead of
  // a spinner; month navigation still fetches client-side.
  const kstNow = getKSTDate();
  const year = kstNow.getFullYear();
  const month = kstNow.getMonth() + 1;
  const { start, end } = getMonthRange(year, month);
  const initialSummary = await getDeliverySummary(start, end);

  return (
    <DeliverySummaryView
      initialYear={year}
      initialMonth={month}
      initialSummary={initialSummary}
    />
  );
}
