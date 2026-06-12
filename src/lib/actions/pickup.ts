"use server";

import { createClient, getAuthUser, getAuthUserId } from "@/lib/supabase/server";
import { formatDateISO, getKSTDate } from "@/lib/utils";
import type { ActionResult, Pickup } from "@/types";

// Neither mutation below revalidates any path: the pickup page refreshes
// its own list client-side after a successful action, and the home page is
// fully dynamic (re-fetched on navigation). Revalidating here would force
// an inline re-render of /pickup in every action response, which is what
// made the 챙겼어요 button feel slow.

export async function confirmPickup(pickupDate: string, menuId?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAuthUserId();

  if (!userId) return { error: "AUTH_REQUIRED" };

  const row: Record<string, unknown> = {
    user_id: userId,
    pickup_date: pickupDate,
    confirmed: true,
    confirmed_at: new Date().toISOString(),
  };
  if (menuId) row.menu_id = menuId;

  // Upsert on the (user_id, pickup_date) unique constraint replaces the
  // old select-then-insert/update pair. The streak recomputation reads
  // other days' pickups, so it can fetch in parallel with this write; the
  // just-changed date is applied locally inside updateStreak.
  const [{ error }] = await Promise.all([
    supabase.from("pickups").upsert(row, { onConflict: "user_id,pickup_date" }),
    updateStreak(userId, { date: pickupDate, confirmed: true }),
  ]);

  if (error) return { error: error.message };
  return { success: true };
}

export async function undoPickup(pickupDate: string): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = await getAuthUserId();

  if (!userId) return { error: "AUTH_REQUIRED" };

  const [{ error }] = await Promise.all([
    supabase
      .from("pickups")
      .update({ confirmed: false, confirmed_at: null })
      .eq("user_id", userId)
      .eq("pickup_date", pickupDate),
    updateStreak(userId, { date: pickupDate, confirmed: false }),
  ]);

  if (error) return { error: error.message };
  return { success: true };
}

export async function getMyPickups(
  startDate: string,
  endDate: string
): Promise<Pickup[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

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
  const user = await getAuthUser();

  if (!user) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("pickup_streak")
    .eq("id", user.id)
    .single();

  return profile?.pickup_streak ?? 0;
}

/**
 * Recomputes the user's pickup streak.
 *
 * `change` describes the pickup mutation happening in the same request, so
 * the confirmed-dates query can run in parallel with that write instead of
 * after it — the changed date is applied to the fetched set locally, which
 * makes the result deterministic regardless of write/read ordering.
 */
async function updateStreak(
  userId: string,
  change: { date: string; confirmed: boolean }
): Promise<void> {
  const supabase = await createClient();

  const { data: pickups } = await supabase
    .from("pickups")
    .select("pickup_date, confirmed")
    .eq("user_id", userId)
    .eq("confirmed", true)
    .order("pickup_date", { ascending: false })
    .limit(60);

  const confirmedDates = new Set(
    (pickups ?? []).map((p: { pickup_date: string }) => p.pickup_date)
  );
  if (change.confirmed) confirmedDates.add(change.date);
  else confirmedDates.delete(change.date);

  if (confirmedDates.size === 0) {
    await supabase
      .from("profiles")
      .update({ pickup_streak: 0 })
      .eq("id", userId);
    return;
  }

  let streak = 0;
  const today = getKSTDate();
  const todayStr = formatDateISO(today);

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
