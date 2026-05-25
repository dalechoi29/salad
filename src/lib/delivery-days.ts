/** Collapse DeliveryDay rows into ISO date strings (YYYY-MM-DD). */
export function expandDeliveryDaysToDateStrings(
  rows: { week_start: string; selected_days: number[] | null }[]
): string[] {
  const out: string[] = [];
  for (const dd of rows) {
    const ws = new Date(dd.week_start + "T00:00:00");
    for (const dayOfWeek of dd.selected_days ?? []) {
      const d = new Date(ws);
      d.setDate(ws.getDate() + (dayOfWeek - 1));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
  }
  return out;
}
