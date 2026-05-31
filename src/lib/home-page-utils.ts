import type { Subscription, SubscriptionPeriod } from "@/types";

export function findCurrentSubscription(
  subscriptions: Subscription[],
  todayStr: string
): Subscription | null {
  type SubWithPeriod = Subscription & { subscription_periods?: SubscriptionPeriod | null };
  const withPeriod = subscriptions as SubWithPeriod[];

  for (const sub of withPeriod) {
    const p = sub.subscription_periods;
    if (!p?.delivery_start || !p.delivery_end) continue;
    const start = p.delivery_start.slice(0, 10);
    const end = p.delivery_end.slice(0, 10);
    if (start <= todayStr && end >= todayStr) return sub;
  }

  const upcoming = withPeriod
    .filter((sub) => {
      const p = sub.subscription_periods;
      return p?.delivery_start && p.delivery_start.slice(0, 10) > todayStr;
    })
    .sort((a, b) =>
      (a.subscription_periods?.delivery_start ?? "").localeCompare(
        b.subscription_periods?.delivery_start ?? ""
      )
    );
  if (upcoming.length > 0) return upcoming[0];

  const past = withPeriod
    .filter((sub) => {
      const p = sub.subscription_periods;
      return p?.delivery_end && p.delivery_end.slice(0, 10) < todayStr;
    })
    .sort((a, b) =>
      (b.subscription_periods?.delivery_end ?? "").localeCompare(
        a.subscription_periods?.delivery_end ?? ""
      )
    );
  return past[0] ?? subscriptions[0] ?? null;
}

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekdayRange(mondayISO: string): string[] {
  return Array.from({ length: 5 }, (_, i) => addDaysISO(mondayISO, i));
}

/** Guest home strip: current-week Mon–Fri on weekdays; next-week Mon–Fri on weekends. */
export function getGuestStripWeekdays(todayStr: string): string[] {
  const today = new Date(todayStr + "T00:00:00");
  const dow = today.getDay();
  const thisMonday = getMondayISO(todayStr);

  if (dow === 0 || dow === 6) {
    return getWeekdayRange(addDaysISO(thisMonday, 7));
  }

  return getWeekdayRange(thisMonday);
}

export function excludeBlockedDates(
  dates: string[],
  holidays: { holiday_date: string }[],
  storeClosures: { closure_date: string }[]
): string[] {
  const blocked = new Set([
    ...holidays.map((h) => h.holiday_date),
    ...storeClosures.map((c) => c.closure_date),
  ]);
  return dates.filter((d) => !blocked.has(d));
}

export type SubscriptionWithPeriod = Subscription & {
  subscription_periods?: SubscriptionPeriod | null;
};

export function getEffectiveTotalDays(subscription: Subscription): number {
  return (
    (subscription.total_delivery_days ?? 0) ||
    (subscription.frequency_per_week ?? 0) * 4
  );
}

export function hasClosureInPeriod(
  period: SubscriptionPeriod | null | undefined,
  closures: { closure_date: string }[]
): boolean {
  if (!period?.delivery_start || !period.delivery_end) return false;
  const start = period.delivery_start.slice(0, 10);
  const end = period.delivery_end.slice(0, 10);
  return closures.some(
    (closure) => closure.closure_date >= start && closure.closure_date <= end
  );
}
