"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getCallerAdminRole, getMyPermissions } from "@/lib/actions/admin";
import { todayKstIso } from "@/lib/subscription-hold";
import type { ActionResult } from "@/types";

export type AdminSubscriptionHoldListRow = {
  id: string;
  subscription_id: string;
  status: string;
  start_date: string;
  end_date: string;
  duration_kind: string;
  created_at: string;
  cancelled_at: string | null;
  user_email: string | null;
  user_real_name: string | null;
  target_month: string | null;
};

async function canViewSubscriptionHolds(): Promise<boolean> {
  const role = await getCallerAdminRole();
  if (!role) return false;
  if (role === "super_admin") return true;
  const perms = await getMyPermissions();
  return perms.includes("subscription_status");
}

export async function listSubscriptionHoldsForAdmin(): Promise<
  AdminSubscriptionHoldListRow[]
> {
  if (!(await canViewSubscriptionHolds())) return [];
  const supabase = await createClient();

  const { data: holds, error } = await supabase
    .from("subscription_holds")
    .select(
      "id, subscription_id, status, start_date, end_date, duration_kind, created_at, cancelled_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error || !holds?.length) return [];

  const subIds = [...new Set(holds.map((h: { subscription_id: string }) => h.subscription_id))];
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id, user_id, period_id")
    .in("id", subIds);

  const subById = new Map(
    (subs ?? []).map((s: { id: string; user_id: string; period_id: string }) => [
      s.id,
      s,
    ])
  );

  const userIds = [
    ...new Set((subs ?? []).map((s: { user_id: string }) => s.user_id)),
  ];
  let profiles: { id: string; email: string; real_name: string }[] | null = null;
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, real_name")
      .in("id", userIds);
    profiles = data as typeof profiles;
  }

  const profById = new Map(
    (profiles ?? []).map((p: { id: string; email: string; real_name: string }) => [
      p.id,
      p,
    ])
  );

  const periodIds = [
    ...new Set((subs ?? []).map((s: { period_id: string }) => s.period_id)),
  ];
  let periods: { id: string; target_month: string }[] | null = null;
  if (periodIds.length > 0) {
    const { data } = await supabase
      .from("subscription_periods")
      .select("id, target_month")
      .in("id", periodIds);
    periods = data as typeof periods;
  }

  const periodById = new Map(
    (periods ?? []).map((p: { id: string; target_month: string }) => [p.id, p])
  );

  return holds.map((h: Record<string, unknown>) => {
    const sub = subById.get(h.subscription_id as string) as
      | { user_id: string; period_id: string }
      | undefined;
    const prof = sub ? profById.get(sub.user_id) : undefined;
    const per = sub ? periodById.get(sub.period_id) : undefined;
    return {
      id: h.id as string,
      subscription_id: h.subscription_id as string,
      status: h.status as string,
      start_date: h.start_date as string,
      end_date: h.end_date as string,
      duration_kind: h.duration_kind as string,
      created_at: h.created_at as string,
      cancelled_at: (h.cancelled_at as string | null) ?? null,
      user_email: (prof as { email?: string } | undefined)?.email ?? null,
      user_real_name: (prof as { real_name?: string } | undefined)?.real_name ?? null,
      target_month: (per as { target_month?: string } | undefined)?.target_month ?? null,
    };
  });
}

/** Mark holds whose exclusive end_date is on or before today (KST) as completed. */
export async function expirePastSubscriptionHoldsForAdmin(): Promise<
  ActionResult & { count?: number }
> {
  if (!(await canViewSubscriptionHolds())) {
    return { error: "권한이 없습니다" };
  }

  const supabase = await createClient();
  const today = todayKstIso();

  const { data: rows, error } = await supabase
    .from("subscription_holds")
    .update({ status: "completed" })
    .in("status", ["scheduled", "active"])
    .lte("end_date", today)
    .select("id");

  if (error) return { error: error.message };

  const n = rows?.length ?? 0;
  revalidatePath("/admin/subscription-holds");
  revalidatePath("/subscription");
  revalidatePath("/delivery");
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePath("/admin/subscription-status");
  return { success: true, count: n };
}
