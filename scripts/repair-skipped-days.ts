/**
 * One-off repair script: reconcile delivery_days and skipped_delivery_days.
 *
 * The bug: rescheduleDeliveryDates was not removing the original date from
 * delivery_days, so a date could end up in BOTH tables, making the UI unable
 * to correctly determine whether it's active or cancelled.
 *
 * This script enforces the invariant:
 *   - A date in skipped_delivery_days should NOT be in delivery_days (remove its DOW)
 *   - A date that was re-added as a replacement should NOT be in skipped_delivery_days
 *     (it's active again)
 *
 * Specifically, for every (subscription, delivery_date) in skipped_delivery_days
 * we check if that date's DOW is still listed in delivery_days for that week.
 * If yes → remove it (delivery_days should not contain cancelled dates).
 *
 * Run: npx tsx scripts/repair-skipped-days.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
dotenv.populate(
  process.env as Record<string, string>,
  Object.fromEntries(
    envContent
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const [k, ...v] = l.split("=");
        return [k.trim(), v.join("=").trim()];
      })
  )
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function computeWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const monday = new Date(d);
  const diff = dow === 0 ? 6 : dow - 1;
  monday.setDate(monday.getDate() - diff);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

async function main() {
  console.log("Fetching all skipped_delivery_days …");

  const { data: skipped, error: skipErr } = await supabase
    .from("skipped_delivery_days")
    .select("id, subscription_id, delivery_date, skip_reason");

  if (skipErr) throw new Error(skipErr.message);
  if (!skipped || skipped.length === 0) {
    console.log("No skipped records found. Nothing to repair.");
    return;
  }

  let fixed = 0;

  for (const row of skipped) {
    const { subscription_id, delivery_date } = row;
    const d = new Date(delivery_date + "T00:00:00");
    const dow = d.getDay();
    const weekStart = computeWeekStart(delivery_date);

    const { data: ddRow } = await supabase
      .from("delivery_days")
      .select("id, selected_days")
      .eq("subscription_id", subscription_id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (!ddRow) continue;

    const days: number[] = ddRow.selected_days ?? [];
    if (!days.includes(dow)) continue;

    // This date's DOW is still listed in delivery_days even though it's marked skipped.
    // Remove it.
    const updated = days.filter((x) => x !== dow);
    console.log(
      `  Fixing ${delivery_date} (DOW=${dow}, week=${weekStart}) — removing from delivery_days (was: [${days}], now: [${updated}])`
    );

    if (updated.length === 0) {
      await supabase.from("delivery_days").delete().eq("id", ddRow.id);
    } else {
      await supabase
        .from("delivery_days")
        .update({ selected_days: updated })
        .eq("id", ddRow.id);
    }
    fixed++;
  }

  console.log(`\nRepair complete. Fixed ${fixed} inconsistent records.`);

  // Now also check the reverse: dates in delivery_days that are in skipped_delivery_days
  // should not appear as "selected" in the skipped list if delivery_days won (i.e., the
  // date was re-added as a replacement but the old skip row wasn't cleaned up).
  // Those stale skip rows should be deleted.
  console.log("\nChecking for stale skip rows (date re-added as replacement) …");

  const { data: deliveryDays } = await supabase
    .from("delivery_days")
    .select("subscription_id, week_start, selected_days");

  if (!deliveryDays) return;

  // Build a set of (subscription_id, date) that ARE active deliveries
  const activeSet = new Set<string>();
  for (const dd of deliveryDays) {
    const days: number[] = dd.selected_days ?? [];
    const monday = new Date(dd.week_start + "T00:00:00");
    for (const dow of days) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + (dow === 0 ? 6 : dow - 1));
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      activeSet.add(`${dd.subscription_id}:${iso}`);
    }
  }

  // Re-fetch skipped (may have changed above)
  const { data: skipped2 } = await supabase
    .from("skipped_delivery_days")
    .select("id, subscription_id, delivery_date, skip_reason");

  let staleFixed = 0;
  for (const row of skipped2 ?? []) {
    // Only auto-delete reschedule skips where the date is back as an active delivery.
    // Vacation skips should NOT be auto-deleted this way.
    if (row.skip_reason !== "reschedule") continue;
    const key = `${row.subscription_id}:${row.delivery_date}`;
    if (activeSet.has(key)) {
      console.log(
        `  Removing stale reschedule skip for ${row.delivery_date} (date is now an active delivery)`
      );
      await supabase.from("skipped_delivery_days").delete().eq("id", row.id);
      staleFixed++;
    }
  }

  console.log(`Stale skip cleanup complete. Removed ${staleFixed} stale records.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
