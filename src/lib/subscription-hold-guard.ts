import type { SupabaseClient } from "@supabase/supabase-js";
import { isDeliveryDateInOpenHold } from "@/lib/subscription-hold";

type HoldDateRow = {
  start_date: string;
  end_date: string;
  status: string;
};

/** Any non-terminal hold row for this subscription (scheduled | active). */
export async function hasOpenSubscriptionHold(
  client: SupabaseClient,
  subscriptionId: string
): Promise<boolean> {
  const { data } = await client
    .from("subscription_holds")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .in("status", ["scheduled", "active"])
    .maybeSingle();
  return !!data;
}

/**
 * True if any of the user's subscriptions has an open hold whose [start,end)
 * covers the delivery date (KST yyyy-mm-dd).
 */
export async function userHasActiveHoldCoveringDeliveryDate(
  client: SupabaseClient,
  userId: string,
  deliveryDateIso: string
): Promise<boolean> {
  const day = deliveryDateIso.slice(0, 10);
  const { data: subs } = await client
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId);
  if (!subs?.length) return false;

  for (const sub of subs) {
    const { data: hold } = await client
      .from("subscription_holds")
      .select("start_date, end_date, status")
      .eq("subscription_id", sub.id)
      .in("status", ["scheduled", "active"])
      .maybeSingle();
    if (hold && isDeliveryDateInOpenHold(hold as HoldDateRow, day)) {
      return true;
    }
  }
  return false;
}
