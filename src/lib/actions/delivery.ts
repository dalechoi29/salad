"use server";

import { createClient, createAdminClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, DeliveryDay } from "@/types";

export async function getMyDeliveryDays(
  subscriptionId: string
): Promise<DeliveryDay[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("*")
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId)
    .order("week_start");

  return (data as DeliveryDay[]) ?? [];
}

export async function getMyDeliveryDateStrings(): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("user_id", user.id)
    .order("week_start");

  if (!data?.length) return [];

  const dates: string[] = [];
  for (const dd of data) {
    for (const dayOfWeek of dd.selected_days ?? []) {
      const ws = new Date(dd.week_start + "T00:00:00");
      ws.setDate(ws.getDate() + (dayOfWeek - 1));
      const y = ws.getFullYear();
      const m = String(ws.getMonth() + 1).padStart(2, "0");
      const d = String(ws.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
  }
  return dates.sort();
}

export async function adminGetDeliveryDates(
  subscriptionId: string
): Promise<string[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !["admin", "super_admin"].includes(profile.role)) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("week_start, selected_days")
    .eq("subscription_id", subscriptionId)
    .order("week_start");

  if (!data?.length) return [];

  const dates: string[] = [];
  for (const dd of data) {
    for (const dayOfWeek of dd.selected_days ?? []) {
      const ws = new Date(dd.week_start + "T00:00:00");
      ws.setDate(ws.getDate() + (dayOfWeek - 1));
      const y = ws.getFullYear();
      const m = String(ws.getMonth() + 1).padStart(2, "0");
      const d = String(ws.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
  }
  return dates.sort();
}

export async function adminUpdateDeliveryDates(
  subscriptionId: string,
  userId: string,
  deliveryDates: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile?.role || !["admin", "super_admin"].includes(profile.role)) {
    return { error: "권한이 없습니다" };
  }

  const admin = createAdminClient();

  const { error: delError } = await admin
    .from("delivery_days")
    .delete()
    .eq("subscription_id", subscriptionId)
    .eq("user_id", userId);
  if (delError) return { error: delError.message };

  if (deliveryDates.length > 0) {
    const weekMap = new Map<string, number[]>();
    for (const ds of deliveryDates) {
      const d = new Date(ds + "T00:00:00");
      const dow = d.getDay();
      const monday = new Date(d);
      const diff = dow === 0 ? 6 : dow - 1;
      monday.setDate(monday.getDate() - diff);
      const wk = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      const days = weekMap.get(wk) ?? [];
      if (!days.includes(dow)) days.push(dow);
      weekMap.set(wk, days);
    }

    const rows = [...weekMap.entries()].map(([weekStart, days]) => ({
      user_id: userId,
      subscription_id: subscriptionId,
      week_start: weekStart,
      selected_days: days.sort((a, b) => a - b),
    }));

    const { error: insError } = await admin.from("delivery_days").insert(rows);
    if (insError) return { error: insError.message };
  }

  const { error: updError } = await admin
    .from("subscriptions")
    .update({ total_delivery_days: deliveryDates.length || null })
    .eq("id", subscriptionId);
  if (updError) return { error: updError.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function saveDeliveryDays(
  subscriptionId: string,
  weekStart: string,
  selectedDays: number[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("frequency_per_week, total_delivery_days")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!subscription) return { error: "Subscription not found" };

  if (
    !subscription.total_delivery_days &&
    selectedDays.length > subscription.frequency_per_week
  ) {
    return {
      error: `최대 ${subscription.frequency_per_week}일까지 선택할 수 있습니다`,
    };
  }

  const validDays = selectedDays.every((d) => d >= 1 && d <= 5);
  if (!validDays) {
    return { error: "월~금만 선택 가능합니다" };
  }

  const { data: existing } = await supabase
    .from("delivery_days")
    .select("id")
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId)
    .eq("week_start", weekStart)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("delivery_days")
      .update({ selected_days: selectedDays })
      .eq("id", existing.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("delivery_days").insert({
      user_id: user.id,
      subscription_id: subscriptionId,
      week_start: weekStart,
      selected_days: selectedDays,
    });

    if (error) return { error: error.message };
  }

  revalidatePath("/delivery");
  revalidatePath("/");
  return { success: true };
}

export async function bulkSaveDeliveryDays(
  subscriptionId: string,
  weeklySelections: { weekStart: string; selectedDays: number[] }[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("frequency_per_week, total_delivery_days")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!subscription) return { error: "Subscription not found" };

  for (const { selectedDays } of weeklySelections) {
    if (selectedDays.some((d) => d < 1 || d > 5)) {
      return { error: "월~금만 선택 가능합니다" };
    }
    if (
      !subscription.total_delivery_days &&
      selectedDays.length > subscription.frequency_per_week
    ) {
      return {
        error: `최대 ${subscription.frequency_per_week}일까지 선택할 수 있습니다`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("delivery_days")
    .delete()
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId);

  if (deleteError) return { error: deleteError.message };

  if (weeklySelections.length > 0) {
    const rows = weeklySelections
      .filter((w) => w.selectedDays.length > 0)
      .map((w) => ({
        user_id: user.id,
        subscription_id: subscriptionId,
        week_start: w.weekStart,
        selected_days: w.selectedDays,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("delivery_days")
        .insert(rows);

      if (insertError) return { error: insertError.message };
    }
  }

  revalidatePath("/delivery");
  revalidatePath("/");
  return { success: true };
}
