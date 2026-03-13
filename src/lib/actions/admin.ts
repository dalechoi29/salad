"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

export async function approveUser(
  userId: string,
  password: string
): Promise<ActionResult> {
  if (!password || password.length !== 4 || !/^\d{4}$/.test(password)) {
    return { error: "Password must be exactly 4 digits" };
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("approve_user", {
    target_user_id: userId,
    new_password: password,
  });

  if (error) {
    console.error("[approveUser] Error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function disableUser(userId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ status: "disabled" })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function getAllUsers() {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return [];
  }

  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return users ?? [];
}

export async function getAllowedDomains() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("allowed_domains")
    .select("*")
    .order("domain");

  return data ?? [];
}

export async function addAllowedDomain(domain: string): Promise<ActionResult> {
  const supabase = await createClient();

  const cleaned = domain.replace(/^@/, "").trim().toLowerCase();
  if (!cleaned || !cleaned.includes(".")) {
    return { error: "Invalid domain format" };
  }

  const { error } = await supabase
    .from("allowed_domains")
    .insert({ domain: cleaned });

  if (error) {
    if (error.code === "23505") {
      return { error: "Domain already exists" };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function removeAllowedDomain(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("allowed_domains")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Dashboard Analytics ─────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  approvedUsers: number;
  activeSubscribers: number;
  paidSubscribers: number;
  totalPickups: number;
  totalDeliveries: number;
  pickupRate: number;
  menuPopularity: { menuId: string; menuTitle: string; count: number }[];
  dailyDeliveries: { date: string; count: number }[];
}

export async function getDashboardStats(
  periodId?: string
): Promise<DashboardStats> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") {
    return {
      totalUsers: 0, approvedUsers: 0, activeSubscribers: 0,
      paidSubscribers: 0, totalPickups: 0, totalDeliveries: 0,
      pickupRate: 0, menuPopularity: [], dailyDeliveries: [],
    };
  }

  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  const { count: approvedUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");

  let subsQuery = supabase.from("subscriptions").select("*", { count: "exact", head: true });
  let paidQuery = supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("payment_status", "completed");

  if (periodId) {
    subsQuery = subsQuery.eq("period_id", periodId);
    paidQuery = paidQuery.eq("period_id", periodId);
  }

  const { count: activeSubscribers } = await subsQuery;
  const { count: paidSubscribers } = await paidQuery;

  const { count: totalPickups } = await supabase
    .from("pickups")
    .select("*", { count: "exact", head: true })
    .eq("confirmed", true);

  const { data: selections } = await supabase
    .from("user_menu_selections")
    .select("delivery_date, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))");

  const totalDeliveries = selections?.length ?? 0;
  const pickupRate = totalDeliveries > 0
    ? Math.round(((totalPickups ?? 0) / totalDeliveries) * 100)
    : 0;

  const menuCountMap = new Map<string, { menuId: string; menuTitle: string; count: number }>();
  const dailyCountMap = new Map<string, number>();

  for (const sel of selections ?? []) {
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (menu) {
      const existing = menuCountMap.get(menu.id);
      if (existing) {
        existing.count += 1;
      } else {
        menuCountMap.set(menu.id, { menuId: menu.id, menuTitle: menu.title, count: 1 });
      }
    }
    const d = sel.delivery_date;
    dailyCountMap.set(d, (dailyCountMap.get(d) ?? 0) + 1);
  }

  const menuPopularity = Array.from(menuCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const dailyDeliveries = Array.from(dailyCountMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  return {
    totalUsers: totalUsers ?? 0,
    approvedUsers: approvedUsers ?? 0,
    activeSubscribers: activeSubscribers ?? 0,
    paidSubscribers: paidSubscribers ?? 0,
    totalPickups: totalPickups ?? 0,
    totalDeliveries,
    pickupRate,
    menuPopularity,
    dailyDeliveries,
  };
}

// ─── Vendor Report ───────────────────────────────────────────

export interface VendorReportRow {
  date: string;
  totalSalads: number;
  menuBreakdown: { menuTitle: string; count: number }[];
}

export async function getVendorReport(
  startDate: string,
  endDate: string
): Promise<VendorReportRow[]> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return [];

  const { data: selections } = await supabase
    .from("user_menu_selections")
    .select(
      "delivery_date, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title))"
    )
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  if (!selections || selections.length === 0) return [];

  const dateMap = new Map<string, Map<string, { menuTitle: string; count: number }>>();

  for (const sel of selections) {
    const date = sel.delivery_date;
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (!menu) continue;

    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const menuMap = dateMap.get(date)!;

    const existing = menuMap.get(menu.id);
    if (existing) {
      existing.count += 1;
    } else {
      menuMap.set(menu.id, { menuTitle: menu.title, count: 1 });
    }
  }

  const result: VendorReportRow[] = [];
  for (const [date, menuMap] of dateMap) {
    const menuBreakdown = Array.from(menuMap.values()).sort((a, b) => b.count - a.count);
    result.push({
      date,
      totalSalads: menuBreakdown.reduce((sum, m) => sum + m.count, 0),
      menuBreakdown,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Community Moderation ────────────────────────────────────

export async function getAdminPosts(
  limit = 50,
  offset = 0
): Promise<{ posts: any[]; total: number }> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return { posts: [], total: 0 };

  const { count } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true });

  const { data } = await supabase
    .from("posts")
    .select("*, profile:profiles(nickname, email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return { posts: data ?? [], total: count ?? 0 };
}

export async function getAdminComments(
  postId: string
): Promise<any[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("comments")
    .select("*, profile:profiles(nickname, email)")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function adminDeletePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return { error: "Unauthorized" };

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  revalidatePath("/community");
  return { success: true };
}

export async function adminDeleteComment(commentId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();

  if (adminProfile?.role !== "admin") return { error: "Unauthorized" };

  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return { error: error.message };

  revalidatePath("/admin/community");
  return { success: true };
}

// ─── Delivery Summary ────────────────────────────────────────

export interface DailySummaryItem {
  date: string;
  totalSalads: number;
  menuBreakdown: {
    menuId: string;
    menuTitle: string;
    menuImage: string | null;
    count: number;
  }[];
}

export async function getDeliverySummary(
  startDate: string,
  endDate: string
): Promise<DailySummaryItem[]> {
  const supabase = await createClient();

  const { data: selections } = await supabase
    .from("user_menu_selections")
    .select(
      "delivery_date, daily_menu_assignment:daily_menu_assignments(menu:menus(id, title, image_url))"
    )
    .gte("delivery_date", startDate)
    .lte("delivery_date", endDate)
    .order("delivery_date");

  if (!selections || selections.length === 0) return [];

  const dateMap = new Map<
    string,
    Map<string, { menuId: string; menuTitle: string; menuImage: string | null; count: number }>
  >();

  for (const sel of selections) {
    const date = sel.delivery_date;
    const menu = (sel.daily_menu_assignment as any)?.menu;
    if (!menu) continue;

    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const menuMap = dateMap.get(date)!;

    const existing = menuMap.get(menu.id);
    if (existing) {
      existing.count += 1;
    } else {
      menuMap.set(menu.id, {
        menuId: menu.id,
        menuTitle: menu.title,
        menuImage: menu.image_url,
        count: 1,
      });
    }
  }

  const result: DailySummaryItem[] = [];
  for (const [date, menuMap] of dateMap) {
    const menuBreakdown = Array.from(menuMap.values()).sort(
      (a, b) => b.count - a.count
    );
    result.push({
      date,
      totalSalads: menuBreakdown.reduce((sum, m) => sum + m.count, 0),
      menuBreakdown,
    });
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}
