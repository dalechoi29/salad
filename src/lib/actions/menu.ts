"use server";

import { createClient, createAdminClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
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

  revalidatePath("/admin/menus");
  return { success: true };
}

export async function deleteMenu(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("menus").delete().eq("id", id);
  if (error) return { error: error.message };

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

export async function getDailyMenus(
  startDate: string,
  endDate: string
): Promise<DailyMenu[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("daily_menu_assignments")
    .select("id, delivery_date, menu_id, slot_type, created_at")
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  return hydrateDailyMenus(supabase, (data as DailyMenu[]) ?? []);
}

export async function getDailyMenusByDate(
  date: string
): Promise<DailyMenu[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("daily_menu_assignments")
    .select("id, delivery_date, menu_id, slot_type, created_at")
    .eq("delivery_date", date)
    .order("slot_type");

  return hydrateDailyMenus(supabase, (data as DailyMenu[]) ?? []);
}

export async function getDailyMenusByDates(
  dates: string[]
): Promise<Record<string, DailyMenu[]>> {
  if (dates.length === 0) return {};
  const supabase = await createClient();

  const { data } = await supabase
    .from("daily_menu_assignments")
    .select("id, delivery_date, menu_id, slot_type, created_at")
    .in("delivery_date", dates)
    .order("slot_type");

  const hydrated = await hydrateDailyMenus(supabase, (data as DailyMenu[]) ?? []);
  const result: Record<string, DailyMenu[]> = {};
  for (const d of dates) result[d] = [];
  for (const row of hydrated) {
    const date = (row as any).delivery_date;
    if (date) (result[date] ??= []).push(row);
  }
  return result;
}

async function hydrateDailyMenus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignments: DailyMenu[]
): Promise<DailyMenu[]> {
  if (assignments.length === 0) return [];

  // Fetch menu metadata once per unique menu instead of repeating
  // `menus(*)` for every daily assignment row. This matters because
  // sandwich/bowl menus are fixed and assigned across many dates.
  const menuIds = [...new Set(assignments.map((a) => a.menu_id))];
  const { data: menus } = await supabase.from("menus").select("*").in("id", menuIds);
  const menuMap = new Map((menus as Menu[] | null ?? []).map((menu) => [menu.id, menu]));

  return assignments.map((assignment) => ({
    ...assignment,
    menu: menuMap.get(assignment.menu_id),
  }));
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
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  if (await userHasActiveHoldCoveringDeliveryDate(supabase, user.id, deliveryDate)) {
    return { error: "홀드 기간에는 메뉴를 변경할 수 없어요." };
  }

  // A user picking / updating / clearing a menu for a date changes the
  // vendor report totals and the admin subscription-status drill-down for
  // that date. Invalidate both after any successful mutation below.
  const revalidateRelated = () => {
    revalidatePath("/menu");
    revalidatePath("/admin/subscription-status");
    revalidatePath("/admin/reports");
  };

  if (quantity <= 0) {
    const { error } = await supabase
      .from("user_menu_selections")
      .delete()
      .eq("user_id", user.id)
      .eq("daily_menu_id", dailyMenuId);

    if (error) return { error: error.message };
    revalidateRelated();
    return { success: true };
  }

  if (replaceForDate) {
    await supabase
      .from("user_menu_selections")
      .delete()
      .eq("user_id", user.id)
      .eq("delivery_date", deliveryDate)
      .neq("daily_menu_id", dailyMenuId);
  }

  const { data: existing } = await supabase
    .from("user_menu_selections")
    .select("id")
    .eq("user_id", user.id)
    .eq("daily_menu_id", dailyMenuId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("user_menu_selections")
      .update({ quantity })
      .eq("id", existing.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("user_menu_selections")
      .insert({
        user_id: user.id,
        daily_menu_id: dailyMenuId,
        delivery_date: deliveryDate,
        quantity,
      });

    if (error) return { error: error.message };
  }

  revalidateRelated();
  return { success: true };
}

// ─── Menu Favorites ─────────────────────────────────────────

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
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: existing } = await supabase
    .from("menu_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("menu_id", menuId)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("menu_favorites")
      .delete()
      .eq("id", existing.id);

    if (error) return { error: error.message };
    revalidatePath("/menu");
    return { success: true, favorited: false };
  } else {
    const { error } = await supabase
      .from("menu_favorites")
      .insert({ user_id: user.id, menu_id: menuId });

    if (error) return { error: error.message };
    revalidatePath("/menu");
    return { success: true, favorited: true };
  }
}
