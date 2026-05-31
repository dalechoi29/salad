import { getMenuPageWeekData } from "@/lib/actions/menu-page";
import { MenuWeekHydrator } from "./menu-week-hydration";

export async function MenuWeekServerLoader({
  weekStart,
  weekEnd,
  weekKey,
}: {
  weekStart: string;
  weekEnd: string;
  weekKey: string;
}) {
  const { menus, selections } = await getMenuPageWeekData(weekStart, weekEnd);
  return (
    <MenuWeekHydrator menus={menus} selections={selections} weekKey={weekKey} />
  );
}
