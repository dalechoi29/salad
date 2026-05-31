import type { DailyMenu, MenuSelection } from "@/types";

export type MenuDetail = {
  menuId?: string;
  title: string;
  imageUrl?: string | null;
  sauce?: string | null;
  protein?: number | null;
  kcal?: number | null;
};

export function buildAvailableMenusByDate(
  dailyMenus: DailyMenu[]
): Record<string, MenuDetail[]> {
  const availableMenusByDate: Record<string, MenuDetail[]> = {};
  for (const dm of dailyMenus) {
    if (dm.slot_type !== "main" || !dm.menu) continue;
    const date = dm.delivery_date;
    if (!availableMenusByDate[date]) availableMenusByDate[date] = [];
    availableMenusByDate[date].push({
      menuId: dm.menu.id,
      title: dm.menu.title,
      imageUrl: (dm.menu as { image_url?: string | null }).image_url ?? null,
      sauce: (dm.menu as { sauce?: string | null }).sauce ?? null,
      protein: (dm.menu as { protein?: number | null }).protein ?? null,
      kcal: (dm.menu as { kcal?: number | null }).kcal ?? null,
    });
  }
  return availableMenusByDate;
}

export function buildMenuDetailByDate(
  selections: MenuSelection[],
  dailyMenus: DailyMenu[],
  dateFilter?: Set<string>
): Record<string, MenuDetail[]> {
  const assignmentById = new Map(dailyMenus.map((dm) => [dm.id, dm]));
  const result: Record<string, MenuDetail[]> = {};

  for (const s of selections) {
    if (dateFilter && !dateFilter.has(s.delivery_date)) continue;
    const menu = assignmentById.get(s.daily_menu_id)?.menu;
    if (!menu) continue;
    if (!result[s.delivery_date]) result[s.delivery_date] = [];
    result[s.delivery_date].push({
      menuId: menu.id,
      title: menu.title,
      imageUrl: (menu as { image_url?: string | null }).image_url ?? null,
      sauce: (menu as { sauce?: string | null }).sauce ?? null,
      protein: (menu as { protein?: number | null }).protein ?? null,
      kcal: (menu as { kcal?: number | null }).kcal ?? null,
    });
  }

  return result;
}
