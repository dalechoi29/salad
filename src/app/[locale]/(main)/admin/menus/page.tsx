import { getMenus } from "@/lib/actions/menu";
import { MenuManagement } from "./menu-management";

export default async function AdminMenusPage() {
  const menus = await getMenus();
  return <MenuManagement initialMenus={menus} />;
}
