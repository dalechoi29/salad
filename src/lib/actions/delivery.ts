"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, DeliveryDay } from "@/types";

export async function getMyDeliveryDays(
  subscriptionId: string
): Promise<DeliveryDay[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("delivery_days")
    .select("*")
    .eq("user_id", user.id)
    .eq("subscription_id", subscriptionId)
    .order("week_start");

  return (data as DeliveryDay[]) ?? [];
}

export async function saveDeliveryDays(
  subscriptionId: string,
  weekStart: string,
  selectedDays: number[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("frequency_per_week")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!subscription) return { error: "Subscription not found" };

  if (selectedDays.length > subscription.frequency_per_week) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("frequency_per_week")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .single();

  if (!subscription) return { error: "Subscription not found" };

  for (const { selectedDays } of weeklySelections) {
    if (selectedDays.some((d) => d < 1 || d > 5)) {
      return { error: "월~금만 선택 가능합니다" };
    }
    if (selectedDays.length > subscription.frequency_per_week) {
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
