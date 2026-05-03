import { getAdminSettings, getWeeklyMenuDeadlines } from "@/lib/actions/admin";
import { AdminSettingsView } from "./admin-settings-view";
import { formatDateISO, getKSTDate } from "@/lib/utils";

export default async function AdminSettingsPage() {
  const today = getKSTDate();
  const rangeStart = formatDateISO(today);
  const rangeEndDate = new Date(today);
  rangeEndDate.setDate(rangeEndDate.getDate() + 120);
  const [settings, weeklyDeadlines] = await Promise.all([
    getAdminSettings(),
    getWeeklyMenuDeadlines(rangeStart, formatDateISO(rangeEndDate)),
  ]);

  return (
    <AdminSettingsView
      initialCutoffDay={parseInt(settings.menu_selection_cutoff_day ?? "4", 10)}
      initialCutoffTime={settings.menu_selection_cutoff_time ?? "23:59"}
      initialWeeklyDeadlines={weeklyDeadlines}
    />
  );
}
