"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  ActionResult,
  SubscriptionPeriod,
  Subscription,
  PaymentMethod,
} from "@/types";

// ─── Subscription Periods (Admin) ────────────────────────────

export async function getSubscriptionPeriods(): Promise<SubscriptionPeriod[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_periods")
    .select("*")
    .order("apply_start", { ascending: false });
  return (data as SubscriptionPeriod[]) ?? [];
}

export async function getSubscriptionPeriodById(
  periodId: string
): Promise<SubscriptionPeriod | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  return (data as SubscriptionPeriod) ?? null;
}

export async function getActivePeriod(): Promise<SubscriptionPeriod | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const todayDate = new Date().toISOString().split("T")[0];

  // First: check if we're in an apply/pay window (for upcoming subscriptions)
  const { data: applyPeriod } = await supabase
    .from("subscription_periods")
    .select("*")
    .lte("apply_start", now)
    .gte("pay_end", now)
    .order("apply_start", { ascending: false })
    .limit(1)
    .single();

  if (applyPeriod) return applyPeriod as SubscriptionPeriod;

  // Fallback: find a period whose delivery window includes today
  const { data: deliveryPeriod } = await supabase
    .from("subscription_periods")
    .select("*")
    .lte("delivery_start", todayDate)
    .gte("delivery_end", todayDate)
    .order("delivery_start", { ascending: false })
    .limit(1)
    .single();

  return (deliveryPeriod as SubscriptionPeriod) ?? null;
}

export async function createSubscriptionPeriod(
  period: Omit<SubscriptionPeriod, "id" | "created_at" | "updated_at">
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("subscription_periods")
    .insert(period);

  if (error) return { error: error.message };

  revalidatePath("/admin/subscriptions");
  return { success: true };
}

export async function updateSubscriptionPeriod(
  id: string,
  period: Partial<Omit<SubscriptionPeriod, "id" | "created_at" | "updated_at">>
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("subscription_periods")
    .update(period)
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/subscriptions");
  return { success: true };
}

export async function deleteSubscriptionPeriod(
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("subscription_periods")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/subscriptions");
  return { success: true };
}

// ─── Cancel Subscription ─────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("subscriptions")
    .delete()
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  await supabase
    .from("delivery_days")
    .delete()
    .eq("subscription_id", subscriptionId);

  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  return { success: true };
}

// ─── User Subscriptions ──────────────────────────────────────

export async function getMySubscription(
  periodId: string
): Promise<Subscription | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("period_id", periodId)
    .single();

  return (data as Subscription) ?? null;
}

export async function getMyLatestSubscription(): Promise<Subscription | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("*, subscription_periods(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return (data as Subscription) ?? null;
}

export async function getMySubscriptions(): Promise<Subscription[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("subscriptions")
    .select("*, subscription_periods(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as Subscription[]) ?? [];
}

export async function getMyLastPaymentMethod(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("subscriptions")
    .select("payment_method")
    .eq("user_id", user.id)
    .not("payment_method", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data?.payment_method ?? null;
}

export async function createOrUpdateSubscription(
  periodId: string,
  frequency: number,
  saladsPerDelivery: number,
  totalDeliveryDays?: number
): Promise<ActionResult & { subscriptionId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: period } = await supabase
    .from("subscription_periods")
    .select("*")
    .eq("id", periodId)
    .single();

  if (!period) return { error: "Subscription period not found" };

  const now = new Date();
  const payEnd = new Date(period.pay_end);

  if (now > payEnd) {
    return { error: "PERIOD_CLOSED" };
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("period_id", periodId)
    .single();

  if (existing) {
    const updateData: Record<string, unknown> = {
      frequency_per_week: frequency,
      salads_per_delivery: saladsPerDelivery,
      payment_method: null,
      payment_status: "pending",
    };
    if (totalDeliveryDays !== undefined) {
      updateData.total_delivery_days = totalDeliveryDays;
    }

    const { error } = await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("id", existing.id);

    if (error) return { error: error.message };

    revalidatePath("/subscription");
    revalidatePath("/delivery");
    revalidatePath("/");
    return { success: true, subscriptionId: existing.id };
  } else {
    const { data: inserted, error } = await supabase
      .from("subscriptions")
      .insert({
        user_id: user.id,
        period_id: periodId,
        frequency_per_week: frequency,
        salads_per_delivery: saladsPerDelivery,
        total_delivery_days: totalDeliveryDays ?? null,
        payment_status: "pending",
      })
      .select("id")
      .single();

    if (error) return { error: error.message };

    revalidatePath("/subscription");
    revalidatePath("/delivery");
    revalidatePath("/");
    return { success: true, subscriptionId: inserted.id };
  }
}

export async function updatePaymentAndMarkPaid(
  subscriptionId: string,
  paymentMethod: PaymentMethod
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("subscriptions")
    .update({
      payment_method: paymentMethod,
      payment_status: "completed",
    })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  return { success: true };
}

export async function updatePaymentMethod(
  subscriptionId: string,
  paymentMethod: PaymentMethod
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("subscriptions")
    .update({ payment_method: paymentMethod })
    .eq("id", subscriptionId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/");
  return { success: true };
}

export async function adminUpdateSubscriptionPayment(
  subscriptionId: string,
  paymentMethod: PaymentMethod,
  paymentStatus: "pending" | "completed"
): Promise<ActionResult> {
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
    .from("subscriptions")
    .update({
      payment_method: paymentMethod,
      payment_status: paymentStatus,
    })
    .eq("id", subscriptionId);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

// ─── Admin Queries ───────────────────────────────────────────

export async function getSubscriptionsByPeriod(
  periodId: string
): Promise<(Subscription & { profiles: { nickname: string; email: string; real_name: string } })[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("subscriptions")
    .select("*, profiles(nickname, email, real_name)")
    .eq("period_id", periodId)
    .order("created_at", { ascending: false });

  return (data as any) ?? [];
}
