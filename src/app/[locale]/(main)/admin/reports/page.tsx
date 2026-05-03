import {
  getCallerAdminRole,
  getMyPermissions,
  getMenuSelectionCutoff,
  getVendorReport,
  getWeeklyMenuDeadlines,
} from "@/lib/actions/admin";
import { getKSTDate, getMonthRange } from "@/lib/utils";
import { redirect } from "next/navigation";
import { VendorReportView } from "./vendor-report-view";

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function AdminReportsPage() {
  const [adminRole, permissions] = await Promise.all([
    getCallerAdminRole(),
    getMyPermissions(),
  ]);

  if (
    !adminRole ||
    (adminRole !== "super_admin" && !permissions.includes("vendor_report"))
  ) {
    redirect("/admin");
  }

  const kst = getKSTDate();
  const initialYear = kst.getFullYear();
  const initialMonth = kst.getMonth() + 1;
  const { start, end } = getMonthRange(initialYear, initialMonth);

  const [initialCutoff, initialRows, deadlines] = await Promise.all([
    getMenuSelectionCutoff(),
    getVendorReport(start, end),
    getWeeklyMenuDeadlines(getMondayISO(start), end),
  ]);

  const initialDeadlineOverrides = Object.fromEntries(
    deadlines.map((d) => [d.week_start, d.deadline_at])
  );

  return (
    <VendorReportView
      initialYear={initialYear}
      initialMonth={initialMonth}
      initialRows={initialRows}
      initialCutoff={initialCutoff}
      initialDeadlineOverrides={initialDeadlineOverrides}
    />
  );
}
