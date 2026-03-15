import { getAdminSettings } from "@/lib/actions/admin";
import { AdminSettingsView } from "./admin-settings-view";

export default async function AdminSettingsPage() {
  const settings = await getAdminSettings();

  return (
    <AdminSettingsView
      initialCutoffDay={parseInt(settings.menu_selection_cutoff_day ?? "4", 10)}
      initialCutoffTime={settings.menu_selection_cutoff_time ?? "23:59"}
    />
  );
}
