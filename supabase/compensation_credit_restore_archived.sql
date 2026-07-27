-- Restore deleted compensation credits as archived "적용 완료" records.
--
-- Use when admins deleted credits that were actually consumed on a paid
-- subscription (e.g. 최진권, 이유화) because the UI wrongly showed 미적용.
--
-- Reconstructs from subscription history:
--   • payment_status = completed
--   • carryover_delivery_days > 0
--   • carryover_from_subscription_id IS NULL  (compensation-credit carryover, not store-closure chain)
--
-- Restored rows:
--   • applied_at + applied_to_subscription_id set → never consumed again
--   • admin_notes = 'archive:applied:<subscription_id>' → idempotent
--
-- Does NOT touch pending sick-leave / vacation credits for the current month.
-- Run section 1 (preview) first, then section 2 (insert).
-- ⚠️  Run ONE section at a time in Supabase SQL Editor.

-- ─── 1. PREVIEW: subscriptions missing an applied-credit archive ───────────

WITH compensation_used AS (
  SELECT
    s.id AS subscription_id,
    s.user_id,
    s.carryover_delivery_days AS days,
    s.paid_at,
    sp.target_month AS applied_period,
    sp.delivery_start AS applied_start,
    (
      SELECT sp2.target_month
      FROM subscriptions s2
      JOIN subscription_periods sp2 ON sp2.id = s2.period_id
      WHERE s2.user_id = s.user_id
        AND sp2.delivery_start < sp.delivery_start
      ORDER BY sp2.delivery_start DESC
      LIMIT 1
    ) AS source_period
  FROM subscriptions s
  JOIN subscription_periods sp ON sp.id = s.period_id
  WHERE s.payment_status = 'completed'
    AND COALESCE(s.carryover_delivery_days, 0) > 0
    AND s.carryover_from_subscription_id IS NULL
),
missing_archive AS (
  SELECT cu.*
  FROM compensation_used cu
  WHERE NOT EXISTS (
    SELECT 1
    FROM compensation_credits cc
    WHERE cc.applied_to_subscription_id = cu.subscription_id
      AND cc.applied_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM compensation_credits cc
    WHERE cc.admin_notes = 'archive:applied:' || cu.subscription_id::text
  )
)
SELECT
  p.real_name,
  ma.subscription_id,
  ma.days,
  ma.source_period,
  ma.applied_period,
  ma.paid_at AS applied_at_will_be
FROM missing_archive ma
JOIN profiles p ON p.id = ma.user_id
ORDER BY ma.applied_start DESC, p.real_name;


-- ─── 2. INSERT archived applied records ────────────────────────────────────

WITH compensation_used AS (
  SELECT
    s.id AS subscription_id,
    s.user_id,
    s.carryover_delivery_days AS days,
    COALESCE(s.paid_at, s.updated_at, now()) AS applied_at,
    sp.target_month AS applied_period,
    sp.delivery_start AS applied_start,
    COALESCE(
      (
        SELECT sp2.target_month
        FROM subscriptions s2
        JOIN subscription_periods sp2 ON sp2.id = s2.period_id
        WHERE s2.user_id = s.user_id
          AND sp2.delivery_start < sp.delivery_start
        ORDER BY sp2.delivery_start DESC
        LIMIT 1
      ),
      sp.target_month
    ) AS source_period
  FROM subscriptions s
  JOIN subscription_periods sp ON sp.id = s.period_id
  WHERE s.payment_status = 'completed'
    AND COALESCE(s.carryover_delivery_days, 0) > 0
    AND s.carryover_from_subscription_id IS NULL
),
missing_archive AS (
  SELECT cu.*
  FROM compensation_used cu
  WHERE NOT EXISTS (
    SELECT 1
    FROM compensation_credits cc
    WHERE cc.applied_to_subscription_id = cu.subscription_id
      AND cc.applied_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM compensation_credits cc
    WHERE cc.admin_notes = 'archive:applied:' || cu.subscription_id::text
  )
)
INSERT INTO compensation_credits (
  user_id,
  days,
  source_period,
  reason,
  admin_notes,
  applied_to_subscription_id,
  applied_at,
  created_at
)
SELECT
  ma.user_id,
  ma.days,
  ma.source_period,
  ma.applied_period || ' 구독에 보상 적용 (기록 복원)',
  'archive:applied:' || ma.subscription_id::text,
  ma.subscription_id,
  ma.applied_at,
  ma.applied_at
FROM missing_archive ma;
