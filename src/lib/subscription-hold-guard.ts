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
 *
 * Single round trip: open holds are joined to subscriptions and filtered by
 * the owning user, instead of one query per subscription.
 */
export async function userHasActiveHoldCoveringDeliveryDate(
  client: SupabaseClient,
  userId: string,
  deliveryDateIso: string
): Promise<boolean> {
  const day = deliveryDateIso.slice(0, 10);
  const { data: holds } = await client
    .from("subscription_holds")
    .select("start_date, end_date, status, subscriptions!inner(user_id)")
    .eq("subscriptions.user_id", userId)
    .in("status", ["scheduled", "active"]);

  return ((holds ?? []) as unknown as HoldDateRow[]).some((hold) =>
    isDeliveryDateInOpenHold(hold, day)
  );
}
