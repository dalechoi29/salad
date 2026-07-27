-- Compensation credit reconciliation
-- Safe to re-run.
--
-- ⚠️  Run ONE section at a time in Supabase SQL Editor (select the block, then Run).
--
-- Related scripts:
--   • compensation_credit_restore_archived.sql — bring back admin-deleted
--     credits as archived "적용 완료" (won't double-apply)
--   • july_30_2026_closure_compensation.sql — 7/30 closure grant only
--
-- Credit types:
--   • Vacation / sick leave ("N월 구독 연기") — source_subscription_id = current-month sub;
--     should apply only to a LATER paid subscription with carryover_delivery_days > 0.
--   • Store closure ("가게 휴무 보상") — admin_notes = closure:YYYY-MM-DD
--   • Manual admin credits — no source_subscription_id
--
-- Run section 1 first (preview), then 2–3 as needed.

-- ─── 1. PREVIEW: credits that look falsely "applied" ───────────────────────
-- Includes cases like 최진권's new sick-leave credit showing 적용 before next
-- month payment, or credits marked applied without a valid target subscription.

SELECT
  p.real_name,
  cc.id AS credit_id,
  cc.days,
  cc.source_period,
  cc.reason,
  cc.applied_at,
  cc.applied_to_subscription_id,
  source_sp.target_month AS source_month,
  target_sp.target_month AS target_month,
  target.payment_status AS target_payment_status,
  COALESCE(target.carryover_delivery_days, 0) AS target_carryover_days,
  CASE
    WHEN cc.applied_at IS NULL THEN 'pending (ok)'
    WHEN cc.admin_notes LIKE 'archive:applied:%' THEN 'ok (archived restore)'
    WHEN cc.applied_to_subscription_id IS NULL THEN 'FALSE: applied but no target sub'
    WHEN target.id IS NULL THEN 'FALSE: target sub missing'
    WHEN target.payment_status IS DISTINCT FROM 'completed' THEN 'FALSE: target not paid'
    WHEN COALESCE(target.carryover_delivery_days, 0) <= 0 THEN 'FALSE: target has no carryover'
    WHEN cc.source_subscription_id IS NOT NULL
      AND source_sp.delivery_start IS NOT NULL
      AND target_sp.delivery_start IS NOT NULL
      AND target_sp.delivery_start <= source_sp.delivery_start
      THEN 'FALSE: applied to same/earlier month (not next month)'
    ELSE 'ok (legitimately applied)'
  END AS status
FROM compensation_credits cc
JOIN profiles p ON p.id = cc.user_id
LEFT JOIN subscriptions source ON source.id = cc.source_subscription_id
LEFT JOIN subscription_periods source_sp ON source_sp.id = source.period_id
LEFT JOIN subscriptions target ON target.id = cc.applied_to_subscription_id
LEFT JOIN subscription_periods target_sp ON target_sp.id = target.period_id
WHERE cc.applied_at IS NOT NULL
ORDER BY p.real_name, cc.created_at DESC;


-- ─── 2. REVERT falsely applied credits → back to 미적용 ───────────────────
-- Keeps legitimately applied credits and archived restores (archive:applied:*).
-- Run this block alone (do not include section 1 in the same run).

UPDATE compensation_credits cc
SET
  applied_at = NULL,
  applied_to_subscription_id = NULL
WHERE cc.applied_at IS NOT NULL
  AND (cc.admin_notes IS NULL OR cc.admin_notes NOT LIKE 'archive:applied:%')
  AND cc.source_subscription_id IS NOT NULL
  AND (
    cc.applied_to_subscription_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM subscriptions target
      WHERE target.id = cc.applied_to_subscription_id
        AND target.payment_status = 'completed'
        AND COALESCE(target.carryover_delivery_days, 0) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM subscriptions source
      JOIN subscription_periods source_sp ON source_sp.id = source.period_id
      JOIN subscriptions target ON target.id = cc.applied_to_subscription_id
      JOIN subscription_periods target_sp ON target_sp.id = target.period_id
      WHERE source.id = cc.source_subscription_id
        AND source_sp.delivery_start IS NOT NULL
        AND target_sp.delivery_start IS NOT NULL
        AND target_sp.delivery_start <= source_sp.delivery_start
    )
  );

UPDATE compensation_credits cc
SET
  applied_at = NULL,
  applied_to_subscription_id = NULL
WHERE cc.applied_at IS NOT NULL
  AND (cc.admin_notes IS NULL OR cc.admin_notes NOT LIKE 'archive:applied:%')
  AND cc.source_subscription_id IS NULL
  AND (
    cc.applied_to_subscription_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM subscriptions target
      WHERE target.id = cc.applied_to_subscription_id
        AND target.payment_status = 'completed'
        AND COALESCE(target.carryover_delivery_days, 0) > 0
    )
  );


-- ─── 3. PREVIEW: reserved credits ready to finalize (미적용 → 적용) ────────
-- Fixes the opposite bug (박진희-style): used on a paid next-month sub but
-- applied_at still null.

SELECT
  p.real_name,
  cc.id AS credit_id,
  cc.days,
  cc.reason,
  cc.applied_to_subscription_id,
  target_sp.target_month AS applied_to_month,
  target.carryover_delivery_days,
  target.paid_at
FROM compensation_credits cc
JOIN profiles p ON p.id = cc.user_id
JOIN subscriptions target ON target.id = cc.applied_to_subscription_id
JOIN subscription_periods target_sp ON target_sp.id = target.period_id
LEFT JOIN subscriptions source ON source.id = cc.source_subscription_id
LEFT JOIN subscription_periods source_sp ON source_sp.id = source.period_id
WHERE cc.applied_at IS NULL
  AND cc.applied_to_subscription_id IS NOT NULL
  AND target.payment_status = 'completed'
  AND COALESCE(target.carryover_delivery_days, 0) > 0
  AND (
    cc.source_subscription_id IS NULL
    OR source_sp.delivery_start IS NULL
    OR target_sp.delivery_start > source_sp.delivery_start
  )
ORDER BY p.real_name;


-- ─── 4. FINALIZE legitimately used credits on paid next-month subscriptions ─
-- Run this block alone.

UPDATE compensation_credits cc
SET applied_at = COALESCE(
  (
    SELECT target.paid_at
    FROM subscriptions target
    WHERE target.id = cc.applied_to_subscription_id
  ),
  now()
)
WHERE cc.applied_at IS NULL
  AND cc.applied_to_subscription_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM subscriptions target
    JOIN subscription_periods target_sp ON target_sp.id = target.period_id
    WHERE target.id = cc.applied_to_subscription_id
      AND target.payment_status = 'completed'
      AND COALESCE(target.carryover_delivery_days, 0) > 0
  )
  AND (
    cc.source_subscription_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM subscriptions source
      JOIN subscription_periods source_sp ON source_sp.id = source.period_id
      JOIN subscriptions target ON target.id = cc.applied_to_subscription_id
      JOIN subscription_periods target_sp ON target_sp.id = target.period_id
      WHERE source.id = cc.source_subscription_id
        AND source_sp.delivery_start IS NOT NULL
        AND target_sp.delivery_start IS NOT NULL
        AND target_sp.delivery_start <= source_sp.delivery_start
    )
  );


-- ─── 5. PREVIEW: pending vacation/sick-leave credits (should stay 미적용) ──

SELECT
  p.real_name,
  cc.id,
  cc.days,
  cc.source_period,
  cc.reason,
  source_sp.target_month AS earned_from_month,
  (
    SELECT COUNT(*)
    FROM skipped_delivery_days sk
    WHERE sk.subscription_id = cc.source_subscription_id
      AND (sk.skip_reason IS NULL OR sk.skip_reason <> 'reschedule')
  ) AS active_vacation_skips
FROM compensation_credits cc
JOIN profiles p ON p.id = cc.user_id
LEFT JOIN subscriptions source ON source.id = cc.source_subscription_id
LEFT JOIN subscription_periods source_sp ON source_sp.id = source.period_id
WHERE cc.applied_at IS NULL
  AND cc.source_subscription_id IS NOT NULL
  AND cc.reason LIKE '%연기%'
ORDER BY p.real_name, cc.created_at DESC;
