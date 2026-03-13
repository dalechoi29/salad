import { getMenus } from "@/lib/actions/menu";
import { AssignmentManagement } from "./assignment-management";

export default async function AdminMenuAssignmentsPage() {
  const menus = await getMenus(true);
  return <AssignmentManagement menus={menus} />;
}
