-- July 30, 2026 store closure compensation backfill
-- Grants 1 free delivery day to paid July subscribers flagged by the closure
-- cleanup (closure_reselection_required). Safe to re-run (idempotent).
--
-- Note: delivery_days no longer contain 7/30 after cleanup, so we use the
-- closure flag + period overlap instead of selected_days.

WITH affected AS (
  SELECT DISTINCT
    s.id AS subscription_id,
    s.user_id,
    sp.target_month
  FROM subscriptions s
  JOIN subscription_periods sp ON sp.id = s.period_id
  WHERE s.payment_status = 'completed'
    AND s.closure_reselection_required = true
    AND sp.delivery_start <= '2026-07-30'
    AND sp.delivery_end >= '2026-07-30'
    AND EXISTS (
      SELECT 1 FROM store_closures sc
      WHERE sc.closure_date = '2026-07-30'
    )
),
users_with_other_pending AS (
  SELECT DISTINCT cc.user_id
  FROM compensation_credits cc
  WHERE cc.applied_at IS NULL
    AND (cc.admin_notes IS DISTINCT FROM 'closure:2026-07-30')
)
INSERT INTO compensation_credits (
  user_id,
  days,
  source_period,
  source_subscription_id,
  reason,
  admin_notes
)
SELECT
  a.user_id,
  1,
  a.target_month,
  a.subscription_id,
  CASE
    WHEN u.user_id IS NOT NULL THEN '7/30 가게 휴무 보상 (추가)'
    ELSE '7/30 가게 휴무 보상'
  END,
  'closure:2026-07-30'
FROM affected a
LEFT JOIN users_with_other_pending u ON u.user_id = a.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM compensation_credits existing
  WHERE existing.source_subscription_id = a.subscription_id
    AND existing.admin_notes = 'closure:2026-07-30'
);

-- Finalize credits reserved on a paid next-month subscription with carryover.
-- For full reconciliation, use supabase/compensation_credit_reconcile.sql §4.

UPDATE compensation_credits cc
SET applied_at = COALESCE(
  (SELECT s.paid_at FROM subscriptions s WHERE s.id = cc.applied_to_subscription_id),
  now()
)
WHERE cc.applied_at IS NULL
  AND cc.applied_to_subscription_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM subscriptions s
    JOIN subscription_periods sp ON sp.id = s.period_id
    WHERE s.id = cc.applied_to_subscription_id
      AND s.payment_status = 'completed'
      AND COALESCE(s.carryover_delivery_days, 0) > 0
  )
  AND (
    cc.source_subscription_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM subscriptions source
      JOIN subscription_periods source_sp ON source_sp.id = source.period_id
      JOIN subscriptions s ON s.id = cc.applied_to_subscription_id
      JOIN subscription_periods sp ON sp.id = s.period_id
      WHERE source.id = cc.source_subscription_id
        AND source_sp.delivery_start IS NOT NULL
        AND sp.delivery_start <= source_sp.delivery_start
    )
  );
