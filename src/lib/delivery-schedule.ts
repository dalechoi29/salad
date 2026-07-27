/**
 * Shared helpers for turning delivery_days + skipped_delivery_days into the
 * dates that should appear on home 구독 현황, admin reports, etc.
 */

export type DeliveryDayRow = {
  subscription_id: string;
  user_id: string;
  week_start: string;
  selected_days: number[] | null;
};

export type SkippedDayRow = {
  subscription_id: string;
  delivery_date: string;
};

export function dateFromWeekAndDay(weekStart: string, day: number): string {
  const base = new Date(weekStart + "T00:00:00");
  base.setDate(base.getDate() + (day - 1));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Set of "subscriptionId:YYYY-MM-DD" keys for O(1) skip lookups. */
export function buildSkippedDateKeySet(
  rows: SkippedDayRow[] | null | undefined
): Set<string> {
  const set = new Set<string>();
  for (const row of rows ?? []) {
    set.add(`${row.subscription_id}:${row.delivery_date.slice(0, 10)}`);
  }
  return set;
}

export function isDeliveryDateSkipped(
  subscriptionId: string,
  dateStr: string,
  skippedKeys: Set<string>
): boolean {
  return skippedKeys.has(`${subscriptionId}:${dateStr.slice(0, 10)}`);
}

/** Expand delivery_days rows to active (non-skipped) dates per subscription. */
export function expandActiveDeliveryDatesBySub(
  deliveryRows: DeliveryDayRow[] | null | undefined,
  skippedKeys: Set<string>
): Map<string, Set<string>> {
  const bySub = new Map<string, Set<string>>();
  for (const row of deliveryRows ?? []) {
    const weekStart = row.week_start;
    const selected = row.selected_days ?? [];
    if (!weekStart || selected.length === 0) continue;

    const set = bySub.get(row.subscription_id) ?? new Set<string>();
    for (const day of selected) {
      const dateStr = dateFromWeekAndDay(weekStart, day);
      if (isDeliveryDateSkipped(row.subscription_id, dateStr, skippedKeys)) {
        continue;
      }
      set.add(dateStr);
    }
    bySub.set(row.subscription_id, set);
  }
  return bySub;
}

/** Salad totals per date from active (non-skipped) delivery days. */
export function countSaladsPerDateFromDeliveryRows(
  deliveryRows: DeliveryDayRow[] | null | undefined,
  skippedKeys: Set<string>,
  saladsBySubId: Map<string, number>,
  disabledUserIds: Set<string> = new Set()
): Record<string, number> {
  const dateCounts: Record<string, number> = {};
  for (const row of deliveryRows ?? []) {
    if (disabledUserIds.has(row.user_id)) continue;
    const saladsPerDelivery = saladsBySubId.get(row.subscription_id) ?? 1;
    const weekStart = row.week_start;
    const selected = row.selected_days ?? [];
    if (!weekStart || selected.length === 0) continue;

    for (const day of selected) {
      const dateStr = dateFromWeekAndDay(weekStart, day);
      if (isDeliveryDateSkipped(row.subscription_id, dateStr, skippedKeys)) {
        continue;
      }
      dateCounts[dateStr] = (dateCounts[dateStr] || 0) + saladsPerDelivery;
    }
  }
  return dateCounts;
}

/** User IDs scheduled on a date (excluding skipped and disabled users). */
export function userIdsForActiveDeliveryDate(
  deliveryRows: DeliveryDayRow[] | null | undefined,
  skippedKeys: Set<string>,
  targetDate: string,
  disabledUserIds: Set<string> = new Set()
): Set<string> {
  const matched = new Set<string>();
  for (const row of deliveryRows ?? []) {
    if (disabledUserIds.has(row.user_id)) continue;
    const weekStart = row.week_start;
    const selected = row.selected_days ?? [];
    for (const day of selected) {
      const dateStr = dateFromWeekAndDay(weekStart, day);
      if (dateStr !== targetDate) continue;
      if (isDeliveryDateSkipped(row.subscription_id, dateStr, skippedKeys)) {
        continue;
      }
      matched.add(row.user_id);
      break;
    }
  }
  return matched;
}
