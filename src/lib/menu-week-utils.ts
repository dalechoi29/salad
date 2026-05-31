/** Shared week/date helpers for the menu page (server + client). */

export function getWeekdaysBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  while (current <= endDate) {
    const dow = current.getDay();
    if (dow >= 1 && dow <= 5) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/** ISO date of the Monday for the week containing `dateStr`. */
export function getWeekMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday ISO key for grouping dates into calendar weeks. */
export function getWeekNumber(dateStr: string): string {
  return getWeekMondayISO(dateStr);
}

/**
 * Pick the week the menu page should open first — mirrors client logic in
 * MenuSelectionView so SSR loads the same week the client shows on mount.
 */
export function resolveInitialWeekMonday(params: {
  deliveryStart: string;
  deliveryEnd: string;
  myDeliveryDates: string[];
  blockedDates: string[];
  todayStr: string;
  initialFocusDate?: string;
}): string {
  const { deliveryStart, deliveryEnd, myDeliveryDates, blockedDates, todayStr, initialFocusDate } =
    params;

  const blocked = new Set(blockedDates);
  const selectableWeekdays = getWeekdaysBetween(deliveryStart, deliveryEnd).filter(
    (d) => !blocked.has(d)
  );

  const deliverySet =
    myDeliveryDates.length > 0 ? new Set(myDeliveryDates) : null;
  const filteredWeekdays = deliverySet
    ? selectableWeekdays.filter((d) => deliverySet.has(d))
    : selectableWeekdays;
  const isBrowseOnly = !deliverySet || filteredWeekdays.length === 0;
  const weekdays = isBrowseOnly ? selectableWeekdays : filteredWeekdays;

  const weeks = weekdays.reduce<Record<string, string[]>>((acc, date) => {
    const week = getWeekNumber(date);
    if (!acc[week]) acc[week] = [];
    acc[week].push(date);
    return acc;
  }, {});
  const weekKeys = Object.keys(weeks).sort();

  if (initialFocusDate) {
    const focusWeek = getWeekNumber(initialFocusDate);
    if (weekKeys.includes(focusWeek)) return focusWeek;
  }

  const nextDate = weekdays.find((d) => d >= todayStr);
  if (nextDate) {
    const nextWeek = getWeekNumber(nextDate);
    if (weekKeys.includes(nextWeek)) return nextWeek;
  }

  const todayWeek = getWeekNumber(todayStr);
  if (weekKeys.includes(todayWeek)) return todayWeek;

  if (weekKeys.length > 0) return weekKeys[weekKeys.length - 1];

  // Fallback when no weekdays in range (shouldn't happen in normal use).
  const monday = getWeekMondayISO(todayStr);
  return monday < deliveryStart ? deliveryStart : monday;
}

export function getWeekRange(
  weekMonday: string,
  rangeStart: string,
  rangeEnd: string
): { weekStart: string; weekEnd: string } {
  const weekStart = weekMonday < rangeStart ? rangeStart : weekMonday;
  const weekEndCandidate = addDaysISO(weekStart, 4);
  const weekEnd = weekEndCandidate > rangeEnd ? rangeEnd : weekEndCandidate;
  return { weekStart, weekEnd };
}
