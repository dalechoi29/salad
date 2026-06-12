"use server";

import {
  createClient,
  createAdminClient,
  createPublicClient,
  getAuthUser,
  getAuthUserId,
} from "@/lib/supabase/server";
import { revalidatePath, updateTag, unstable_cache } from "next/cache";
import type { ActionResult, Menu, DailyMenu, MenuSelection, MenuFavorite } from "@/types";
import { userHasActiveHoldCoveringDeliveryDate } from "@/lib/subscription-hold-guard";

const DEFAULT_SALAD_IMAGES = [
  "/images/default-salad-1.png",
  "/images/default-salad-2.png",
];

// ─── Menu CRUD (Admin) ──────────────────────────────────────

export async function getMenus(activeOnly = false): Promise<Menu[]> {
  const supabase = await createClient();
  let query = supabase.from("menus").select("*").order("created_at", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data as Menu[]) ?? [];
}

export async function getMenu(id: string): Promise<Menu | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("menus").select("*").eq("id", id).single();
  return (data as Menu) ?? null;
}

export async function createMenu(
  menu: Pick<Menu, "title" | "description" | "sauce" | "category" | "is_main" | "dietary_tags"> & {
    image_url?: string | null;
    protein?: number | null;
    kcal?: number | null;
  }
): Promise<ActionResult & { menuId?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("menus")
    .insert({
      title: menu.title,
      description: menu.description,
      sauce: menu.sauce,
      protein: menu.protein ?? 25,
      kcal: menu.kcal ?? 300,
      image_url: menu.image_url || DEFAULT_SALAD_IMAGES[Math.floor(Math.random() * DEFAULT_SALAD_IMAGES.length)],
      category: menu.category,
      is_main: menu.is_main,
      dietary_tags: menu.dietary_tags,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  updateTag("menus");
  revalidatePath("/admin/menus");
  return { success: true, menuId: data.id };
}

export async function updateMenu(
  id: string,
  updates: Partial<Pick<Menu, "title" | "description" | "sauce" | "protein" | "kcal" | "image_url" | "category" | "is_main" | "is_active" | "dietary_tags">>
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("menus").update(updates).eq("id", id);
  if (error) return { error: error.message };

  updateTag("menus");
  revalidatePath("/admin/menus");
  return { success: true };
}

export async function deleteMenu(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("menus").delete().eq("id", id);
  if (error) return { error: error.message };

  updateTag("menus");
  revalidatePath("/admin/menus");
  return { success: true };
}

// ─── Menu Image Upload ──────────────────────────────────────

export async function uploadMenuImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();

  const file = formData.get("file") as File | null;
  if (!file) return { error: "No file provided" };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("menu-images")
    .upload(fileName, file, { contentType: file.type, upsert: false });

  if (error) return { error: error.message };

  const { data: urlData } = supabase.storage
    .from("menu-images")
    .getPublicUrl(fileName);

  return { url: urlData.publicUrl };
}

// ─── Daily Menu Assignments (Admin) ─────────────────────────

// One round-trip via nested select. The duplicated menu payload per row is
// small (weekly windows are ~30 rows) and cheaper than a second query.
const DAILY_MENU_SELECT =
  "id, delivery_date, menu_id, slot_type, created_at, menu:menus(*)";

// Daily menus are identical for every user — cache across requests with a
// short TTL; admin assignment/menu mutations bust the tag immediately.
const fetchDailyMenusCached = unstable_cache(
  async (startDate: string, endDate: string): Promise<DailyMenu[]> => {
    const supabase = createPublicClient();

    const { data } = await supabase
      .from("daily_menu_assignments")
      .select(DAILY_MENU_SELECT)
      .gte("delivery_date", startDate)
      .lte("delivery_date", endDate)
      .order("delivery_date");

    return (data as unknown as DailyMenu[]) ?? [];
  },
  ["daily-menus"],
  { revalidate: 60, tags: ["menus"] }
);

export async function getDailyMenus(
  startDate: string,
  endDate: string
): Promise<DailyMenu[]> {
  return fetchDailyMenusCached(startDate, endDate);
}

export async function getDailyMenusByDate(date: string): Promise<DailyMenu[]> {
  const rows = await fetchDailyMenusCached(date, date);
  return [...rows].sort((a, b) =>
    (a.slot_type ?? "").localeCompare(b.slot_type ?? "")
  );
}

export async function getDailyMenusByDates(
  dates: string[]
): Promise<Record<string, DailyMenu[]>> {
  if (dates.length === 0) return {};

  // One cached range fetch covers the dates; filter locally.
  const sorted = [...dates].sort();
  const rows = await fetchDailyMenusCached(sorted[0], sorted[sorted.length - 1]);
  const wanted = new Set(dates);

  const result: Record<string, DailyMenu[]> = {};
  for (const d of dates) result[d] = [];
  for (const row of rows) {
    if (row.delivery_date && wanted.has(row.delivery_date)) {
      (result[row.delivery_date] ??= []).push(row);
    }
  }
  for (const d of dates) {
    result[d].sort((a, b) => (a.slot_type ?? "").localeCompare(b.slot_type ?? ""));
  }
  return result;
}

export async function assignMenuToDate(
  deliveryDate: string,
  menuId: string,
  slotType: "main" | "optional" = "main"
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("daily_menu_assignments")
    .upsert(
      { delivery_date: deliveryDate, menu_id: menuId, slot_type: slotType },
      { onConflict: "delivery_date,menu_id" }
    );

  if (error) return { error: error.message };

  updateTag("menus");
  revalidatePath("/admin/menus");
  revalidatePath("/menu");
  // Menu planning changes how unselected salads are attributed in the
  // admin per-date drill-down and in the vendor report.
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  return { success: true };
}

function isWeekdayISO(dateStr: string): boolean {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow >= 1 && dow <= 5;
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function assignFixedSideMenusToOpenDates(): Promise<
  ActionResult & { dateCount?: number; menuCount?: number; assignmentCount?: number }
> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return { error: "관리자 권한이 필요합니다" };
  }

  // This is a maintenance-style admin action that can upsert many rows
  // across current/future periods. After checking the caller is an admin,
  // use the service-role client to avoid fragile RLS failures on bulk
  // insert/update paths.
  const admin = createAdminClient();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [{ data: sideMenus }, { data: periods }] = await Promise.all([
    admin
      .from("menus")
      .select("id")
      .eq("is_active", true)
      .neq("category", "salad"),
    admin
      .from("subscription_periods")
      .select("delivery_start, delivery_end")
      .gte("delivery_end", todayStr)
      .order("delivery_start", { ascending: true }),
  ]);

  const menuIds = ((sideMenus ?? []) as Pick<Menu, "id">[]).map((m) => m.id);
  if (menuIds.length === 0) {
    return { error: "활성화된 샌드위치/보울 메뉴가 없습니다" };
  }

  const ranges = (periods ?? []).filter(
    (p: any) => p.delivery_start && p.delivery_end
  ) as { delivery_start: string; delivery_end: string }[];
  if (ranges.length === 0) {
    return { error: "배달 기간이 설정된 현재/미래 구독 기간이 없습니다" };
  }

  const maxEnd = ranges.reduce(
    (latest, p) => (p.delivery_end > latest ? p.delivery_end : latest),
    todayStr
  );
  const { data: holidays } = await admin
    .from("holidays")
    .select("holiday_date")
    .gte("holiday_date", todayStr)
    .lte("holiday_date", maxEnd);
  const holidaySet = new Set((holidays ?? []).map((h: any) => h.holiday_date as string));

  const openDates = new Set<string>();
  for (const period of ranges) {
    let cur = period.delivery_start > todayStr ? period.delivery_start : todayStr;
    while (cur <= period.delivery_end) {
      if (isWeekdayISO(cur) && !holidaySet.has(cur)) openDates.add(cur);
      cur = addDaysISO(cur, 1);
    }
  }

  if (openDates.size === 0) {
    return { error: "배정할 수 있는 오픈 날짜가 없습니다" };
  }

  const rows = [...openDates].flatMap((deliveryDate) =>
    menuIds.map((menuId) => ({
      delivery_date: deliveryDate,
      menu_id: menuId,
      slot_type: "optional",
    }))
  );

  const { error } = await admin
    .from("daily_menu_assignments")
    .upsert(rows, { onConflict: "delivery_date,menu_id" });

  if (error) return { error: error.message };

  updateTag("menus");
  revalidatePath("/admin/menus");
  revalidatePath("/admin/menus/assignments");
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  return {
    success: true,
    dateCount: openDates.size,
    menuCount: menuIds.length,
    assignmentCount: rows.length,
  };
}

export async function removeMenuFromDate(
  assignmentId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("daily_menu_assignments")
    .delete()
    .eq("id", assignmentId);

  if (error) return { error: error.message };

  updateTag("menus");
  revalidatePath("/admin/menus");
  revalidatePath("/menu");
  revalidatePath("/admin/subscription-status");
  revalidatePath("/admin/reports");
  return { success: true };
}

// ─── User Menu Selections ───────────────────────────────────

export async function getMyMenuSelections(
  startDate: string,
  endDate: string
): Promise<MenuSelection[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("user_menu_selections")
    .select("*, daily_menu_assignment:daily_menu_assignments(*, menu:menus(*))")
    .eq("user_id", user.id)
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  return (data as MenuSelection[]) ?? [];
}

/** Lightweight selections for menu page — no nested menu joins. */
export async function getMyMenuSelectionsSummary(
  startDate: string,
  endDate: string
): Promise<MenuSelection[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("user_menu_selections")
    .select("id, user_id, daily_menu_id, delivery_date, quantity, created_at")
    .eq("user_id", user.id)
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  return (data as MenuSelection[]) ?? [];
}

export async function updateMenuQuantity(
  dailyMenuId: string,
  deliveryDate: string,
  quantity: number,
  replaceForDate = false
): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAuthUserId();

  if (!userId) return { error: "AUTH_REQUIRED" };

  if (await userHasActiveHoldCoveringDeliveryDate(supabase, userId, deliveryDate)) {
    return { error: "홀드 기간에는 메뉴를 변경할 수 없어요." };
  }

  // No revalidation here on purpose: the menu page keeps selections in
  // client state, and the admin pages that show these numbers
  // (subscription-status, reports) are fully dynamic — they re-fetch on
  // every request. Calling revalidatePath inside this action would force
  // an expensive inline re-render of /menu in every action response.

  if (quantity <= 0) {
    const { error } = await supabase
      .from("user_menu_selections")
      .delete()
      .eq("user_id", userId)
      .eq("daily_menu_id", dailyMenuId);

    if (error) return { error: error.message };
    return { success: true };
  }

  // Upsert on the (user_id, daily_menu_id) unique constraint replaces the
  // old select-then-insert/update pair with a single round trip. The
  // replace-for-date cleanup excludes this daily_menu_id, so it can run in
  // parallel with the upsert without racing it.
  const upsertPromise = supabase
    .from("user_menu_selections")
    .upsert(
      {
        user_id: userId,
        daily_menu_id: dailyMenuId,
        delivery_date: deliveryDate,
        quantity,
      },
      { onConflict: "user_id,daily_menu_id" }
    );

  const replacePromise = replaceForDate
    ? supabase
        .from("user_menu_selections")
        .delete()
        .eq("user_id", userId)
        .eq("delivery_date", deliveryDate)
        .neq("daily_menu_id", dailyMenuId)
    : Promise.resolve({ error: null });

  const [{ error }] = await Promise.all([upsertPromise, replacePromise]);

  if (error) return { error: error.message };
  return { success: true };
}

// ─── Menu Favorites ─────────────────────────────────────────

/** Count-only variant for the /my dashboard badge (avoids the full join). */
export async function getMyFavoritesCount(): Promise<number> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return 0;

  const { count } = await supabase
    .from("menu_favorites")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return count ?? 0;
}

export async function getMyFavorites(): Promise<MenuFavorite[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("menu_favorites")
    .select("*, menu:menus(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as MenuFavorite[]) ?? [];
}

export async function getMyFavoriteIds(): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("menu_favorites")
    .select("menu_id")
    .eq("user_id", user.id);

  return ((data as { menu_id: string }[] | null) ?? []).map((row) => row.menu_id);
}

export async function toggleFavorite(menuId: string): Promise<ActionResult & { favorited?: boolean }> {
  const supabase = await createClient();
  const userId = await getAuthUserId();

  if (!userId) return { error: "AUTH_REQUIRED" };

  // No revalidation: every caller (menu list, menu detail, favorites list)
  // tracks favorite state client-side, and /menu fetches favorites fresh on
  // each request anyway. Revalidating here would re-render the current page
  // inline and slow the toggle down.
  const { data: existing } = await supabase
    .from("menu_favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("menu_id", menuId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("menu_favorites")
      .delete()
      .eq("id", existing.id);

    if (error) return { error: error.message };
    return { success: true, favorited: false };
  } else {
    const { error } = await supabase
      .from("menu_favorites")
      .insert({ user_id: userId, menu_id: menuId });

    if (error) return { error: error.message };
    return { success: true, favorited: true };
  }
}
