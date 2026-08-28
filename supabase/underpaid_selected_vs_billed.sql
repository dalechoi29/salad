-- Undercharge: paid days were capped at the cheapest same-frequency weekday
-- (e.g. 추석-shortened Thu/Fri) instead of the dates this person selected.
--
-- billed_days  = subscriptions.total_delivery_days (what they were charged)
-- correct_days = selected delivery dates − carryover (what they should pay)
--
-- Run in Supabase SQL Editor. Do NOT update completed rows until the
-- difference has been collected — billed_days is the audit trail.

WITH selected AS (
  SELECT
    dd.subscription_id,
    COUNT(*)::int AS selected_days
  FROM delivery_days dd
  CROSS JOIN LATERAL unnest(COALESCE(dd.selected_days, ARRAY[]::int[])) AS dow
  GROUP BY dd.subscription_id
)
SELECT
  p.real_name,
  p.email,
  sp.target_month,
  s.payment_status,
  s.payment_method,
  s.frequency_per_week,
  s.salads_per_delivery,
  COALESCE(sel.selected_days, 0) AS selected_days,
  COALESCE(s.carryover_delivery_days, 0) AS carryover_days,
  COALESCE(s.total_delivery_days, 0) AS billed_days,
  GREATEST(
    0,
    COALESCE(sel.selected_days, 0) - COALESCE(s.carryover_delivery_days, 0)
  ) AS correct_paid_days,
  GREATEST(
    0,
    COALESCE(sel.selected_days, 0)
      - COALESCE(s.carryover_delivery_days, 0)
      - COALESCE(s.total_delivery_days, 0)
  ) AS unpaid_days,
  GREATEST(
    0,
    COALESCE(sel.selected_days, 0)
      - COALESCE(s.carryover_delivery_days, 0)
      - COALESCE(s.total_delivery_days, 0)
  )
    * s.salads_per_delivery
    * COALESCE(sp.price_per_salad, 0) AS amount_to_collect,
  s.paid_at
FROM subscriptions s
JOIN subscription_periods sp ON sp.id = s.period_id
JOIN profiles p ON p.id = s.user_id
LEFT JOIN selected sel ON sel.subscription_id = s.id
WHERE s.total_delivery_days IS NOT NULL
  AND GREATEST(
    0,
    COALESCE(sel.selected_days, 0) - COALESCE(s.carryover_delivery_days, 0)
  ) > s.total_delivery_days
ORDER BY
  s.payment_status,
  sp.delivery_start DESC,
  p.real_name;
