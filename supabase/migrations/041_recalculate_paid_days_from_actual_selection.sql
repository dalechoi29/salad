-- Migration 041: Recalculate total_delivery_days for pending subscriptions
-- using the actual number of dates selected rather than the plan default.
--
-- PROBLEM: Migration 038 computed the paid portion as:
--   COALESCE(total_delivery_days, frequency_per_week * 4) - carryover_count
-- When total_delivery_days was set to the "plan default" (e.g. freq × 4 = 8)
-- instead of the actual selection count, the subtraction left too high a value.
-- For example, 서현경 selected 6 dates intentionally (not 8), so:
--   - migration 038 computed  8 - 3 = 5 paid days  (price 28,500)
--   - correct value should be 6 - 3 = 3 paid days  (price 17,100)
--
-- FIX: For pending subscriptions that have carryover set (touched by 038),
-- recalculate total_delivery_days = max(0, actual_dates_within_period - carryover).
-- Uses the real delivery_days rows instead of a plan estimate.
--
-- Run AFTER migration 039 (which removes any spurious extra dates added by 038).
-- Safe to re-run: the formula is idempotent — if total_delivery_days is already
-- correct (e.g. 김은아's 1), the UPDATE is a no-op.

WITH actual_counts AS (
  SELECT
    dd.subscription_id,
    COUNT(
      DISTINCT (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
    ) AS actual_count
  FROM   delivery_days dd
  CROSS  JOIN LATERAL UNNEST(dd.selected_days) AS d
  JOIN   subscriptions      sub ON sub.id  = dd.subscription_id
  JOIN   subscription_periods sp ON sp.id  = sub.period_id
  WHERE  (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
         BETWEEN sp.delivery_start AND sp.delivery_end   -- dates within THIS period only
    AND  sub.payment_status                  = 'pending'
    AND  sub.carryover_delivery_days         > 0
    AND  sub.carryover_from_subscription_id IS NOT NULL
    AND  sp.delivery_start                  IS NOT NULL
    AND  sp.delivery_end                    IS NOT NULL
  GROUP  BY dd.subscription_id
)
UPDATE subscriptions ts
SET    total_delivery_days = GREATEST(0, ac.actual_count - ts.carryover_delivery_days)
FROM   actual_counts ac
WHERE  ts.id             = ac.subscription_id
  AND  ts.payment_status = 'pending';
