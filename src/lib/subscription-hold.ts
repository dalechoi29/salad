import { formatDateISO, getKSTDate } from "@/lib/utils";
import type { SubscriptionHold, SubscriptionHoldDurationKind } from "@/types";

/** ISO week Monday (yyyy-mm-dd) for a calendar date. */
export function weekMondayISOFromDate(d: Date): string {
  const x = new Date(d);
  const dow = x.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  x.setDate(x.getDate() - diff);
  return formatDateISO(x);
}

export function datesToWeeklySelections(
  isoDates: string[]
): { weekStart: string; selectedDays: number[] }[] {
  const weekMap = new Map<string, number[]>();
  for (const iso of isoDates) {
    const date = new Date(iso + "T00:00:00");
    const weekStart = weekMondayISOFromDate(date);
    if (!weekMap.has(weekStart)) weekMap.set(weekStart, []);
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) {
      weekMap.get(weekStart)!.push(dow);
    }
  }
  return [...weekMap.entries()].map(([weekStart, days]) => ({
    weekStart,
    selectedDays: [...new Set(days)].sort((a, b) => a - b),
  }));
}

export function addCalendarDaysISO(iso: string, deltaDays: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + deltaDays);
  return formatDateISO(d);
}

export function addCalendarMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return formatDateISO(d);
}

export function calendarDaysBetweenHalfOpen(
  startInclusive: string,
  endExclusive: string
): number {
  const a = new Date(startInclusive + "T00:00:00").getTime();
  const b = new Date(endExclusive + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

/** Exclusive end date for [start, end) from duration kind. */
export function computeHoldExclusiveEnd(
  startInclusive: string,
  kind: SubscriptionHoldDurationKind
): string {
  if (kind.startsWith("weeks_")) {
    const n = parseInt(kind.slice("weeks_".length), 10);
    return addCalendarDaysISO(startInclusive, n * 7);
  }
  if (kind.startsWith("months_")) {
    const n = parseInt(kind.slice("months_".length), 10);
    return addCalendarMonthsISO(startInclusive, n);
  }
  throw new Error(`Unknown hold duration kind: ${kind}`);
}

export function computeHoldShiftDays(
  startInclusive: string,
  endExclusive: string
): number {
  return calendarDaysBetweenHalfOpen(startInclusive, endExclusive);
}

/**
 * First delivery strictly after today (KST), or first Mon–Fri on/after tomorrow
 * in [delivery_start, delivery_end] when there are no delivery dates yet.
 */
export function findHoldAnchorDate(params: {
  todayKstIso: string;
  deliveryIsoDatesSorted: string[];
  deliveryStart: string | null;
  deliveryEnd: string | null;
}): string | null {
  const { todayKstIso, deliveryIsoDatesSorted, deliveryStart, deliveryEnd } =
    params;

  for (const d of deliveryIsoDatesSorted) {
    if (d > todayKstIso) return d;
  }

  if (!deliveryStart || !deliveryEnd) return null;

  const tomorrow = addCalendarDaysISO(todayKstIso, 1);
  let cur =
    tomorrow > deliveryStart ? tomorrow : deliveryStart;
  if (cur > deliveryEnd) return null;

  while (cur <= deliveryEnd) {
    const dow = new Date(cur + "T00:00:00").getDay();
    if (dow >= 1 && dow <= 5) return cur;
    cur = addCalendarDaysISO(cur, 1);
  }
  return null;
}

export function todayKstIso(): string {
  return formatDateISO(getKSTDate());
}

/**
 * KST calendar yyyy-mm-dd for an instant (e.g. period.pay_end timestamptz).
 */
export function kstCalendarDateFromIsoInstant(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Effective pay deadline calendar date (KST) after cumulative hold extension days.
 */
export function effectivePayDeadlineKstDate(
  payEndIso: string,
  extensionCalendarDays: number
): string {
  const ext = extensionCalendarDays ?? 0;
  if (ext <= 0) return kstCalendarDateFromIsoInstant(payEndIso);
  const base = kstCalendarDateFromIsoInstant(payEndIso);
  return addCalendarDaysISO(base, ext);
}

/**
 * Open hold (scheduled | active) covers deliveryDateIso in [start_date, end_date) (half-open).
 */
export function isDeliveryDateInOpenHold(
  hold: Pick<SubscriptionHold, "start_date" | "end_date"> & {
    status: SubscriptionHold["status"] | string;
  },
  deliveryDateIso: string
): boolean {
  if (hold.status !== "scheduled" && hold.status !== "active") return false;
  const day = deliveryDateIso.slice(0, 10);
  const start = hold.start_date.slice(0, 10);
  const end = hold.end_date.slice(0, 10);
  return day >= start && day < end;
}

/** Shift every delivery on or after holdStart forward by shiftDays (calendar). */
export function applyHoldShiftToSortedDates(
  sortedIsoDates: string[],
  holdStart: string,
  shiftDays: number
): string[] {
  if (shiftDays <= 0) return [...sortedIsoDates];
  const out = sortedIsoDates.map((d) =>
    d >= holdStart ? addCalendarDaysISO(d, shiftDays) : d
  );
  return [...new Set(out)].sort();
}

/** Inverse of applyHoldShiftToSortedDates for the same holdStart and shiftDays. */
export function inverseHoldShiftFromSortedDates(
  sortedIsoDates: string[],
  holdStart: string,
  shiftDays: number
): string[] {
  if (shiftDays <= 0) return [...sortedIsoDates];
  const threshold = addCalendarDaysISO(holdStart, shiftDays);
  const out = sortedIsoDates.map((d) =>
    d >= threshold ? addCalendarDaysISO(d, -shiftDays) : d
  );
  return [...new Set(out)].sort();
}

export const HOLD_DURATION_OPTIONS: {
  kind: SubscriptionHoldDurationKind;
  label: string;
}[] = [
  { kind: "weeks_1", label: "1주" },
  { kind: "weeks_2", label: "2주" },
  { kind: "weeks_3", label: "3주" },
  { kind: "months_1", label: "1개월" },
  { kind: "months_2", label: "2개월" },
  { kind: "months_3", label: "3개월" },
  { kind: "months_4", label: "4개월" },
  { kind: "months_5", label: "5개월" },
  { kind: "months_6", label: "6개월" },
  { kind: "months_7", label: "7개월" },
  { kind: "months_8", label: "8개월" },
  { kind: "months_9", label: "9개월" },
  { kind: "months_10", label: "10개월" },
  { kind: "months_11", label: "11개월" },
  { kind: "months_12", label: "12개월" },
];

const ALL_HOLD_DURATION_KINDS: SubscriptionHoldDurationKind[] =
  HOLD_DURATION_OPTIONS.map((o) => o.kind);

/** Parse admin_settings JSON list; invalid entries dropped; empty/invalid → all kinds. */
export function parseSubscriptionHoldAllowedKindsSetting(
  value: string | undefined
): SubscriptionHoldDurationKind[] {
  const all = ALL_HOLD_DURATION_KINDS;
  if (!value?.trim()) return [...all];
  try {
    const arr = JSON.parse(value) as unknown;
    if (!Array.isArray(arr)) return [...all];
    const allowed = new Set(all);
    const out = arr.filter(
      (x): x is SubscriptionHoldDurationKind =>
        typeof x === "string" && allowed.has(x as SubscriptionHoldDurationKind)
    );
    return out.length > 0 ? out : [...all];
  } catch {
    return [...all];
  }
}
