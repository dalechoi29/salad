"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDateISO } from "@/lib/utils";
import type { ActionResult, Pickup } from "@/types";

export async function confirmPickup(pickupDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("pickups")
    .select("id")
    .eq("user_id", user.id)
    .eq("pickup_date", pickupDate)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("pickups")
      .update({ confirmed: true, confirmed_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("pickups").insert({
      user_id: user.id,
      pickup_date: pickupDate,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
    });

    if (error) return { error: error.message };
  }

  await updateStreak(user.id);

  revalidatePath("/pickup");
  revalidatePath("/");
  return { success: true };
}

export async function undoPickup(pickupDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("pickups")
    .update({ confirmed: false, confirmed_at: null })
    .eq("user_id", user.id)
    .eq("pickup_date", pickupDate);

  if (error) return { error: error.message };

  await updateStreak(user.id);

  revalidatePath("/pickup");
  revalidatePath("/");
  return { success: true };
}

export async function getMyPickups(
  startDate: string,
  endDate: string
): Promise<Pickup[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("pickups")
    .select("*")
    .eq("user_id", user.id)
    .gte("pickup_date", startDate)
    .lte("pickup_date", endDate)
    .order("pickup_date");

  return (data as Pickup[]) ?? [];
}

export async function getPickupStreak(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("pickup_streak")
    .eq("id", user.id)
    .single();

  return profile?.pickup_streak ?? 0;
}

async function updateStreak(userId: string): Promise<void> {
  const supabase = await createClient();

  const { data: pickups } = await supabase
    .from("pickups")
    .select("pickup_date, confirmed")
    .eq("user_id", userId)
    .eq("confirmed", true)
    .order("pickup_date", { ascending: false })
    .limit(60);

  if (!pickups || pickups.length === 0) {
    await supabase
      .from("profiles")
      .update({ pickup_streak: 0 })
      .eq("id", userId);
    return;
  }

  let streak = 0;
  const today = new Date();
  const todayStr = formatDateISO(today);

  const confirmedDates = new Set(pickups.map((p: { pickup_date: string }) => p.pickup_date));

  const cursor = new Date(today);
  // If today isn't confirmed yet, start from yesterday
  if (!confirmedDates.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const dow = cursor.getDay();
    // Skip weekends
    if (dow === 0 || dow === 6) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    const dateStr = formatDateISO(cursor);
    if (confirmedDates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  await supabase
    .from("profiles")
    .update({ pickup_streak: streak })
    .eq("id", userId);
}
