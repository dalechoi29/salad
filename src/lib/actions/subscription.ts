"use server";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { getKSTDate, formatDateISO } from "@/lib/utils";
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
  const kstNow = getKSTDate();
  const now = kstNow.toISOString();
  const todayDate = formatDateISO(kstNow);

  const { data: applyPeriod } = await supabase
    .from("subscription_periods")
    .select("*")
    .lte("apply_start", now)
    .gte("pay_end", now)
    .order("apply_start", { ascending: false })
    .limit(1)
    .single();

  if (applyPeriod) return applyPeriod as SubscriptionPeriod;

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
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

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
  const user = await getAuthUser();

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
  const user = await getAuthUser();

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
  const user = await getAuthUser();

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
  const user = await getAuthUser();

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
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: period } = await supabase
    .from("subscription_periods")
    .select("*")
    .eq("id", periodId)
    .single();

  if (!period) return { error: "Subscription period not found" };

  const now = getKSTDate();
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
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

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
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

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

  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile?.role || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: "권한이 없습니다" };
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

export async function adminAddSubscription(
  periodId: string,
  userId: string,
  frequencyPerWeek: number,
  saladsPerDelivery: number,
  deliveryDates?: string[]
): Promise<ActionResult> {
  const supabase = await createClient();

  const user = await getAuthUser();
  if (!user) return { error: "Unauthorized" };
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!adminProfile?.role || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: "권한이 없습니다" };
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("period_id", periodId)
    .single();

  if (existing) return { error: "이미 구독 중인 사용자입니다" };

  const { data: inserted, error } = await supabase.from("subscriptions").insert({
    user_id: userId,
    period_id: periodId,
    frequency_per_week: frequencyPerWeek,
    salads_per_delivery: saladsPerDelivery,
    total_delivery_days: deliveryDates?.length ?? null,
    payment_method: null,
    payment_status: "pending",
  }).select("id").single();

  if (error) return { error: error.message };

  if (deliveryDates && deliveryDates.length > 0 && inserted) {
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
      subscription_id: inserted.id,
      week_start: weekStart,
      selected_days: days.sort((a, b) => a - b),
    }));

    const { error: ddError } = await supabase.from("delivery_days").insert(rows);
    if (ddError) return { error: ddError.message };
  }

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

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const WEEK_LABELS = ["첫째주", "둘째주", "셋째주", "넷째주", "다섯째주", "여섯째주"];

export async function getSubscriptionSummaryText(
  periodId: string
): Promise<string> {
  const supabase = await createClient();

  const [{ data: periodData }, { data: allSubs }] = await Promise.all([
    supabase.from("subscription_periods").select("*").eq("id", periodId).single(),
    supabase
      .from("subscriptions")
      .select("*, profiles(real_name, email)")
      .eq("period_id", periodId)
      .order("created_at"),
  ]);

  if (!periodData || !allSubs || allSubs.length === 0) return "";

  const subIds = allSubs.map((s: any) => s.id);
  const { data: allDeliveryDays } = await supabase
    .from("delivery_days")
    .select("subscription_id, week_start, selected_days")
    .in("subscription_id", subIds);

  // Build per-subscription weekday union and per-week details
  const deliveryDayMap = new Map<string, Set<number>>();
  const perWeekMap = new Map<string, { week_start: string; selected_days: number[] }[]>();
  for (const dd of allDeliveryDays ?? []) {
    const existing = deliveryDayMap.get(dd.subscription_id) ?? new Set<number>();
    for (const d of dd.selected_days ?? []) existing.add(d);
    deliveryDayMap.set(dd.subscription_id, existing);

    const weeks = perWeekMap.get(dd.subscription_id) ?? [];
    weeks.push({ week_start: dd.week_start, selected_days: dd.selected_days ?? [] });
    perWeekMap.set(dd.subscription_id, weeks);
  }

  // A user is "custom" if their unique weekday set doesn't match their stored frequency,
  // meaning they picked different days in different weeks rather than a consistent preset.
  function isCustomSchedule(subId: string, freq: number): boolean {
    const days = deliveryDayMap.get(subId);
    if (!days || days.size === 0) return false;
    return days.size !== freq;
  }

  // Summarize a custom user's schedule: base pattern + exception notes
  // e.g. "주 2회 신청(화,목) *1주차는 월,목" or "주 1회 신청(화) *3주차 제외"
  function describeCustomSchedule(subId: string, freq: number): string {
    const weeks = perWeekMap.get(subId) ?? [];
    if (weeks.length === 0) return `주 ${freq}회 신청`;

    const sorted = [...weeks].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const patterns = sorted.map((w) => [...w.selected_days].sort());

    // Find the most common pattern (mode) as the base
    const patternCounts = new Map<string, { count: number; days: number[] }>();
    for (const p of patterns) {
      const key = p.join(",");
      const existing = patternCounts.get(key);
      patternCounts.set(key, { count: (existing?.count ?? 0) + 1, days: p });
    }
    const baseDays = [...patternCounts.values()].sort((a, b) => b.count - a.count)[0].days;
    const baseKey = baseDays.join(",");

    const fmtDays = (days: number[]) =>
      days.length === 5 && [...days].sort().join(",") === "1,2,3,4,5"
        ? "월~금"
        : days.map((d) => WEEKDAY_NAMES[d]).join(",");

    const baseDayStr = fmtDays(baseDays);

    const exceptions: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const weekPattern = patterns[i].join(",");
      if (weekPattern === baseKey) continue;

      if (patterns[i].length === 0) {
        exceptions.push(`${i + 1}주차 제외`);
      } else {
        exceptions.push(`${i + 1}주차는 ${fmtDays(patterns[i])}`);
      }
    }

    const header = `주 ${freq}회 신청(${baseDayStr})`;
    if (exceptions.length === 0) return header;
    return `${header} *${exceptions.join(", ")}`;
  }

  const monthMatch = periodData.target_month?.match(/(\d+)월/);
  const month = monthMatch ? monthMatch[1] : periodData.target_month;

  type GroupEntry = {
    name: string;
    price: number;
    paymentLabel: string;
  };

  const paymentLabels: Record<string, string> = {
    gift_certificate: "성남사랑",
    bank_transfer: "계좌이체",
    credit_card: "신용카드",
  };

  function buildGroupedSection(subs: any[]) {
    const groups = new Map<string, { freq: number; weekdays: string; entries: GroupEntry[] }>();
    const customEntries: { name: string; price: number; paymentLabel: string; schedule: string }[] = [];

    for (const sub of subs) {
      const freq = sub.frequency_per_week as number;
      const salads = sub.salads_per_delivery as number;
      const totalDays = sub.total_delivery_days ?? freq * 4;
      const totalSalads = totalDays * salads;
      const price = totalSalads * (periodData.price_per_salad ?? 0);
      const name = sub.profiles?.real_name ?? "이름 없음";
      const methodLabel = paymentLabels[sub.payment_method ?? ""] ?? sub.payment_method ?? "미선택";

      if (isCustomSchedule(sub.id, freq)) {
        const schedule = describeCustomSchedule(sub.id, freq);
        customEntries.push({ name, price, paymentLabel: methodLabel, schedule });
        continue;
      }

      const days = deliveryDayMap.get(sub.id);
      let weekdayStr = "";
      if (days && days.size > 0) {
        const sorted = Array.from(days).sort();
        weekdayStr = sorted.length === 5 && sorted.join(",") === "1,2,3,4,5"
          ? "월~금"
          : sorted.map((d) => WEEKDAY_NAMES[d]).join(",");
      }

      const key = `${freq}-${weekdayStr}`;
      const group = groups.get(key) ?? { freq, weekdays: weekdayStr, entries: [] };
      group.entries.push({ name, price, paymentLabel: methodLabel });
      groups.set(key, group);
    }

    const lines: string[] = [];
    let groupIdx = 1;
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.freq - b.freq);
    for (const group of sortedGroups) {
      const emoji = emojis[groupIdx - 1] ?? `${groupIdx}.`;
      const weekdayPart = group.weekdays ? `(${group.weekdays})` : "";
      lines.push(`${emoji} 주 ${group.freq}회 신청${weekdayPart} ${group.entries.length}명`);
      for (const entry of group.entries) {
        lines.push(`- ${entry.name} ${entry.price.toLocaleString()}원 (${entry.paymentLabel})`);
      }
      groupIdx++;
    }

    for (const entry of customEntries) {
      const emoji = emojis[groupIdx - 1] ?? `${groupIdx}.`;
      lines.push(`${emoji} ${entry.schedule}`);
      lines.push(`- ${entry.name} ${entry.price.toLocaleString()}원 (${entry.paymentLabel})`);
      groupIdx++;
    }

    return lines;
  }

  // Build weekly delivery count per weekday across all subscribers in the set
  function buildWeeklyBreakdown(subs: any[]) {
    const subIdSet = new Set(subs.map((s: any) => s.id));
    const saladsMap = new Map<string, number>();
    for (const sub of subs) saladsMap.set(sub.id, sub.salads_per_delivery ?? 1);

    // Group delivery days by week_start
    const weekMap = new Map<string, Map<number, number>>();
    for (const dd of allDeliveryDays ?? []) {
      if (!subIdSet.has(dd.subscription_id)) continue;
      const perDelivery = saladsMap.get(dd.subscription_id) ?? 1;
      const weekDays = weekMap.get(dd.week_start) ?? new Map<number, number>();
      for (const day of dd.selected_days ?? []) {
        weekDays.set(day, (weekDays.get(day) ?? 0) + perDelivery);
      }
      weekMap.set(dd.week_start, weekDays);
    }

    if (weekMap.size === 0) return [];

    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const lines: string[] = [];
    lines.push("");

    for (let i = 0; i < sortedWeeks.length; i++) {
      const [, dayCountMap] = sortedWeeks[i];
      const label = WEEK_LABELS[i] ?? `${i + 1}째주`;
      const sortedDays = Array.from(dayCountMap.entries()).sort((a, b) => a[0] - b[0]);
      const parts = sortedDays.map(([day, count]) => `${WEEKDAY_NAMES[day]}요일 ${count}개`);
      lines.push(`${month}월 ${label}는 ${parts.join(", ")} 배송해주시면 돼요.`);
    }

    return lines;
  }

  const paidSubs = allSubs.filter((s: any) => s.payment_status === "completed");
  const unpaidSubs = allSubs.filter((s: any) => s.payment_status !== "completed");

  const sections: string[] = [];

  if (paidSubs.length > 0) {
    sections.push(`안녕하세요! ${month}월 신청 및 결제가 모두 완료되어 전달드려요:)`);
    sections.push(`모두 ${month}월 한달 구독 예정입니다.`);
    sections.push("");
    sections.push(...buildGroupedSection(paidSubs));
    sections.push(...buildWeeklyBreakdown(paidSubs));
  }

  if (unpaidSubs.length > 0) {
    if (paidSubs.length > 0) {
      sections.push("");
      sections.push("─".repeat(20));
      sections.push("");
    }
    sections.push(`[미결제] ${month}월 신청은 완료했지만 아직 결제가 안 된 분들이에요.`);
    sections.push("");
    sections.push(...buildGroupedSection(unpaidSubs));
  }

  return sections.join("\n");
}

// Returns dates where the current user is the only subscriber (needs 2+ for delivery)
export async function getSoloDeliveryDates(
  periodId: string
): Promise<{ date: string; weekday: string }[]> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: allSubs } = await supabase
    .from("subscriptions")
    .select("id, user_id")
    .eq("period_id", periodId);

  if (!allSubs?.length) return [];

  const subIds = allSubs.map((s: any) => s.id);
  const mySubIds = new Set(allSubs.filter((s: any) => s.user_id === user.id).map((s: any) => s.id));

  const [{ data: disabledProfiles }, { data: allDeliveryDays }] = await Promise.all([
    supabase.from("profiles").select("id").eq("status", "disabled"),
    supabase.from("delivery_days").select("subscription_id, week_start, selected_days, user_id").in("subscription_id", subIds),
  ]);

  if (!allDeliveryDays?.length) return [];

  const disabledIds = new Set((disabledProfiles ?? []).map((p: any) => p.id));

  // Count total salads per date across all subscribers, and track which dates are mine
  const dateCounts: Record<string, number> = {};
  const myDates = new Set<string>();

  for (const dd of allDeliveryDays) {
    if (disabledIds.has(dd.user_id)) continue;
    for (const day of dd.selected_days ?? []) {
      const date = new Date(dd.week_start + "T00:00:00");
      date.setDate(date.getDate() + day - 1);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      dateCounts[dateStr] = (dateCounts[dateStr] ?? 0) + 1;
      if (mySubIds.has(dd.subscription_id)) {
        myDates.add(dateStr);
      }
    }
  }

  const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
  const soloResults: { date: string; weekday: string }[] = [];

  for (const dateStr of myDates) {
    if ((dateCounts[dateStr] ?? 0) < 2) {
      const dt = new Date(dateStr + "T00:00:00");
      soloResults.push({
        date: dateStr,
        weekday: WEEKDAY_KR[dt.getDay()],
      });
    }
  }

  return soloResults.sort((a, b) => a.date.localeCompare(b.date));
}
