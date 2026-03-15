"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, Menu, DailyMenu, MenuSelection, MenuFavorite } from "@/types";

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
    .select("*, menu:menus(*)")
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  return (data as DailyMenu[]) ?? [];
}

export async function getDailyMenusByDate(
  date: string
): Promise<DailyMenu[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("daily_menu_assignments")
    .select("*, menu:menus(*)")
    .eq("delivery_date", date)
    .order("slot_type");

  return (data as DailyMenu[]) ?? [];
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
  return { success: true };
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
  return { success: true };
}

// ─── User Menu Selections ───────────────────────────────────

export async function getMyMenuSelections(
  startDate: string,
  endDate: string
): Promise<MenuSelection[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

export async function selectMenu(
  dailyMenuId: string,
  deliveryDate: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: existing } = await supabase
    .from("user_menu_selections")
    .select("id")
    .eq("user_id", user.id)
    .eq("delivery_date", deliveryDate)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("user_menu_selections")
      .update({ daily_menu_id: dailyMenuId })
      .eq("id", existing.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("user_menu_selections")
      .insert({
        user_id: user.id,
        daily_menu_id: dailyMenuId,
        delivery_date: deliveryDate,
      });

    if (error) return { error: error.message };
  }

  return { success: true };
}

export async function removeMenuSelection(
  deliveryDate: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("user_menu_selections")
    .delete()
    .eq("user_id", user.id)
    .eq("delivery_date", deliveryDate);

  if (error) return { error: error.message };

  revalidatePath("/menu");
  return { success: true };
}

// ─── Menu Favorites ─────────────────────────────────────────

export async function getMyFavorites(): Promise<MenuFavorite[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("menu_favorites")
    .select("*, menu:menus(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as MenuFavorite[]) ?? [];
}

export async function toggleFavorite(menuId: string): Promise<ActionResult & { favorited?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
