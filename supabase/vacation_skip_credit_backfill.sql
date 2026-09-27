-- Backfill pending vacation-skip credits that failed to insert (RLS).
-- Only for skips that were NOT already consumed as later-month carryover.
--
-- 김은아 2026년 9월: 3 vacation skips (9/1, 9/28, 9/30) → October
-- 강나현 2026년 9월: 1 vacation skip → October
--
-- 김은아 7월 10 skips are already September carryover_delivery_days=10 — do not insert.

-- Preview
WITH vacation_skips AS (
  SELECT
    s.user_id,
    s.id AS source_subscription_id,
    sp.target_month AS source_period,
    COUNT(*) FILTER (
      WHERE sk.skip_reason IS NULL OR sk.skip_reason <> 'reschedule'
    )::int AS skip_days
  FROM subscriptions s
  JOIN subscription_periods sp ON sp.id = s.period_id
  JOIN skipped_delivery_days sk ON sk.subscription_id = s.id
  GROUP BY s.user_id, s.id, sp.target_month
),
consumed AS (
  SELECT
    carryover_from_subscription_id AS source_subscription_id,
    SUM(COALESCE(carryover_delivery_days, 0))::int AS carryover_days
  FROM subscriptions
  WHERE carryover_from_subscription_id IS NOT NULL
  GROUP BY carryover_from_subscription_id
)
SELECT
  p.real_name,
  v.source_period,
  v.skip_days,
  COALESCE(c.carryover_days, 0) AS already_used_as_carryover,
  GREATEST(0, v.skip_days - COALESCE(c.carryover_days, 0)) AS pending_days
FROM vacation_skips v
JOIN profiles p ON p.id = v.user_id
LEFT JOIN consumed c ON c.source_subscription_id = v.source_subscription_id
WHERE GREATEST(0, v.skip_days - COALESCE(c.carryover_days, 0)) > 0
ORDER BY p.real_name, v.source_period;

-- Apply (run after reviewing preview)
-- INSERT INTO compensation_credits (
--   user_id, days, source_period, source_subscription_id, reason
-- )
-- SELECT
--   v.user_id,
--   GREATEST(0, v.skip_days - COALESCE(c.carryover_days, 0)),
--   v.source_period,
--   v.source_subscription_id,
--   regexp_replace(v.source_period, '.*(\d+)월.*', '\1월 구독 연기')
-- FROM vacation_skips v
-- LEFT JOIN consumed c ON c.source_subscription_id = v.source_subscription_id
-- WHERE GREATEST(0, v.skip_days - COALESCE(c.carryover_days, 0)) > 0
--   AND NOT EXISTS (
--     SELECT 1 FROM compensation_credits cc
--     WHERE cc.source_subscription_id = v.source_subscription_id
--       AND cc.applied_at IS NULL
--   );
