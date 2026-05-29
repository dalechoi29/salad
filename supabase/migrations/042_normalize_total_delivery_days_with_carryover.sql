-- Migration 042: Normalize total_delivery_days for all subscriptions with carryover
--
-- PROBLEM: For subscriptions where carryover_delivery_days > 0, the
-- total_delivery_days field may still hold the combined count (paid + carryover)
-- instead of the paid-only count. This causes the admin page (and anywhere else
-- that computes price = total_delivery_days × salads × price_per_salad) to
-- over-charge by including the free carryover days in the price calculation.
--
-- EXAMPLE: 정상범 — 5 total dates, 3 carryover free days, 2 paid days.
--   Before: total_delivery_days = 5  →  price = 5 × 5,700 = 28,500원  ❌
--   After:  total_delivery_days = 2  →  price = 2 × 5,700 = 11,400원  ✓
--
-- FIX: For every subscription with carryover_delivery_days > 0, recount the
-- actual delivery_days rows that fall inside the period window and subtract the
-- carryover entitlement. The result is the paid-days-only value.
--
-- SAFETY / IDEMPOTENCY:
--   If total_delivery_days is already correct (paid only), the formula still
--   produces the same value:
--     actual_count(5) − carryover(3) = 2  →  no change for already-correct rows.
--   Safe to re-run at any time.
--
-- Covers ALL payment statuses (pending, completed, etc.) because migration 041
-- only targeted pending subscriptions.

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
           BETWEEN sp.delivery_start AND sp.delivery_end  -- dates within THIS period only
    AND  sub.carryover_delivery_days > 0
    AND  sp.delivery_start IS NOT NULL
    AND  sp.delivery_end   IS NOT NULL
  GROUP  BY dd.subscription_id
)
UPDATE subscriptions ts
SET    total_delivery_days = GREATEST(0, ac.actual_count - ts.carryover_delivery_days)
FROM   actual_counts ac
WHERE  ts.id                      = ac.subscription_id
  AND  ts.carryover_delivery_days > 0;
