-- July 30, 2026 closure — pre-August subscription readiness check
-- Run BEFORE August apply/pay day to catch double-counted carryover or missing credits.
--
-- ⚠️  Run ONE section at a time in Supabase SQL Editor.
--
-- Prerequisites:
--   1. store_closures has 2026-07-30
--   2. july_30_2026_closure_compensation.sql has been run (section 3 below verifies)
--
-- App logic mirrored here:
--   • Same-source closure credit + remaining carryover from July = 1 day total (not 2)
--   • Other pending credits (e.g. vacation skip) stack on top

-- ─── 1. PREVIEW: all July 30 closure users + expected entitlement ────────────

WITH july_period AS (
  SELECT id, target_month, delivery_start, delivery_end
  FROM subscription_periods
  WHERE delivery_start <= '2026-07-30'
    AND delivery_end >= '2026-07-30'
  ORDER BY delivery_start DESC
  LIMIT 1
),
august_period AS (
  SELECT id, target_month, delivery_start, delivery_end
  FROM subscription_periods
  WHERE delivery_start >= '2026-08-01'
    AND delivery_start < '2026-09-01'
  ORDER BY delivery_start
  LIMIT 1
),
july_subs AS (
  SELECT
    s.id AS july_sub_id,
    s.user_id,
    p.real_name,
    s.closure_reselection_required,
    s.frequency_per_week,
    s.total_delivery_days,
    COALESCE(
      s.total_delivery_days,
      COALESCE(s.frequency_per_week, 0) * 4
    ) AS effective_total_days,
    jp.target_month AS july_month
  FROM subscriptions s
  JOIN profiles p ON p.id = s.user_id
  JOIN july_period jp ON jp.id = s.period_id
  WHERE s.payment_status = 'completed'
    AND s.closure_reselection_required = true
    AND EXISTS (
      SELECT 1 FROM store_closures sc WHERE sc.closure_date = '2026-07-30'
    )
),
selected_counts AS (
  SELECT
    js.july_sub_id,
    COALESCE(SUM(cardinality(dd.selected_days)), 0) AS selected_count
  FROM july_subs js
  LEFT JOIN delivery_days dd ON dd.subscription_id = js.july_sub_id
  GROUP BY js.july_sub_id
),
carryover_used AS (
  SELECT
    js.july_sub_id,
    COALESCE(SUM(other.carryover_delivery_days), 0) AS used_by_other
  FROM july_subs js
  LEFT JOIN subscriptions other
    ON other.carryover_from_subscription_id = js.july_sub_id
    AND NOT (
      other.user_id = js.user_id
      AND other.payment_status = 'pending'
      AND other.period_id = (SELECT id FROM august_period)
    )
  GROUP BY js.july_sub_id
),
pending_credits AS (
  SELECT
    cc.user_id,
    cc.id AS credit_id,
    cc.days,
    cc.reason,
    cc.admin_notes,
    cc.source_subscription_id,
    cc.applied_to_subscription_id
  FROM compensation_credits cc
  WHERE cc.applied_at IS NULL
),
credit_totals AS (
  SELECT
    js.july_sub_id,
    js.user_id,
    COALESCE(SUM(pc.days) FILTER (
      WHERE pc.admin_notes = 'closure:2026-07-30'
        AND pc.source_subscription_id = js.july_sub_id
    ), 0) AS closure_credit_days,
    COALESCE(SUM(pc.days) FILTER (
      WHERE pc.admin_notes IS DISTINCT FROM 'closure:2026-07-30'
        OR pc.source_subscription_id IS DISTINCT FROM js.july_sub_id
        OR pc.source_subscription_id IS NULL
    ), 0) AS other_credit_days,
    BOOL_OR(pc.admin_notes = 'closure:2026-07-30') AS has_closure_credit
  FROM july_subs js
  LEFT JOIN pending_credits pc ON pc.user_id = js.user_id
  GROUP BY js.july_sub_id, js.user_id
),
entitlements AS (
  SELECT
    js.real_name,
    js.july_sub_id,
    js.user_id,
    js.july_month,
    sc.selected_count,
    js.effective_total_days,
    GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other) AS remaining_days,
    ct.closure_credit_days,
    ct.other_credit_days,
    ct.has_closure_credit,
    -- Matches app: max(remaining, closure_credit when remaining=0) + other credits;
    -- when remaining > 0, same-source closure credit does not stack.
    GREATEST(
      GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other),
      CASE
        WHEN GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other) > 0
          THEN 0
        ELSE ct.closure_credit_days
      END
    ) + ct.other_credit_days AS expected_entitlement_days
  FROM july_subs js
  JOIN selected_counts sc ON sc.july_sub_id = js.july_sub_id
  JOIN carryover_used cu ON cu.july_sub_id = js.july_sub_id
  JOIN credit_totals ct ON ct.july_sub_id = js.july_sub_id
),
august_subs AS (
  SELECT
    s.id AS aug_sub_id,
    s.user_id,
    s.payment_status,
    COALESCE(s.carryover_delivery_days, 0) AS carryover_delivery_days,
    s.carryover_from_subscription_id
  FROM subscriptions s
  JOIN august_period ap ON ap.id = s.period_id
)
SELECT
  e.real_name,
  e.july_month,
  e.remaining_days,
  e.closure_credit_days,
  e.other_credit_days,
  e.expected_entitlement_days,
  CASE WHEN e.has_closure_credit THEN 'yes' ELSE 'MISSING CREDIT' END AS closure_credit_ok,
  a.aug_sub_id,
  a.payment_status AS aug_payment_status,
  a.carryover_delivery_days AS aug_carryover_days,
  CASE
    WHEN a.aug_sub_id IS NULL THEN 'ok (not applied yet)'
    WHEN a.payment_status = 'completed' THEN 'ok (already paid)'
    WHEN COALESCE(a.carryover_delivery_days, 0) > e.expected_entitlement_days
      THEN 'FIX: carryover too high'
    WHEN COALESCE(a.carryover_delivery_days, 0) <= e.expected_entitlement_days
      THEN 'ok'
    ELSE 'review'
  END AS status
FROM entitlements e
LEFT JOIN august_subs a ON a.user_id = e.user_id
ORDER BY
  CASE
    WHEN NOT e.has_closure_credit THEN 0
    WHEN COALESCE(a.carryover_delivery_days, 0) > e.expected_entitlement_days THEN 1
    ELSE 2
  END,
  e.real_name;


-- ─── 2. PREVIEW: users missing the 7/30 compensation credit ──────────────────
-- If any rows appear, run july_30_2026_closure_compensation.sql first.

SELECT
  p.real_name,
  js.july_sub_id,
  js.july_month
FROM (
  SELECT
    s.id AS july_sub_id,
    s.user_id,
    sp.target_month AS july_month
  FROM subscriptions s
  JOIN subscription_periods sp ON sp.id = s.period_id
  WHERE s.payment_status = 'completed'
    AND s.closure_reselection_required = true
    AND sp.delivery_start <= '2026-07-30'
    AND sp.delivery_end >= '2026-07-30'
) js
JOIN profiles p ON p.id = js.user_id
WHERE NOT EXISTS (
  SELECT 1
  FROM compensation_credits cc
  WHERE cc.user_id = js.user_id
    AND cc.admin_notes = 'closure:2026-07-30'
    AND cc.source_subscription_id = js.july_sub_id
);


-- ─── 3. FIX: cap over-claimed carryover on pending August subscriptions ────
-- Users who tried to apply with the old double-count (2 days) get reset to the
-- correct entitlement. Credits reserved on those drafts are released so re-apply works.
-- Run section 1 first and confirm the preview looks right.

WITH july_period AS (
  SELECT id FROM subscription_periods
  WHERE delivery_start <= '2026-07-30' AND delivery_end >= '2026-07-30'
  ORDER BY delivery_start DESC LIMIT 1
),
august_period AS (
  SELECT id FROM subscription_periods
  WHERE delivery_start >= '2026-08-01' AND delivery_start < '2026-09-01'
  ORDER BY delivery_start LIMIT 1
),
july_subs AS (
  SELECT
    s.id AS july_sub_id,
    s.user_id,
    COALESCE(s.total_delivery_days, COALESCE(s.frequency_per_week, 0) * 4) AS effective_total_days
  FROM subscriptions s
  JOIN july_period jp ON jp.id = s.period_id
  WHERE s.payment_status = 'completed'
    AND s.closure_reselection_required = true
),
selected_counts AS (
  SELECT js.july_sub_id, COALESCE(SUM(cardinality(dd.selected_days)), 0) AS selected_count
  FROM july_subs js
  LEFT JOIN delivery_days dd ON dd.subscription_id = js.july_sub_id
  GROUP BY js.july_sub_id
),
carryover_used AS (
  SELECT
    js.july_sub_id,
    COALESCE(SUM(other.carryover_delivery_days), 0) AS used_by_other
  FROM july_subs js
  LEFT JOIN subscriptions other
    ON other.carryover_from_subscription_id = js.july_sub_id
    AND NOT (
      other.user_id = js.user_id
      AND other.payment_status = 'pending'
      AND other.period_id = (SELECT id FROM august_period)
    )
  GROUP BY js.july_sub_id
),
credit_totals AS (
  SELECT
    js.july_sub_id,
    js.user_id,
    COALESCE(SUM(pc.days) FILTER (
      WHERE pc.admin_notes IS DISTINCT FROM 'closure:2026-07-30'
        OR pc.source_subscription_id IS DISTINCT FROM js.july_sub_id
        OR pc.source_subscription_id IS NULL
    ), 0) AS other_credit_days,
    COALESCE(SUM(pc.days) FILTER (
      WHERE pc.admin_notes = 'closure:2026-07-30'
        AND pc.source_subscription_id = js.july_sub_id
    ), 0) AS closure_credit_days
  FROM july_subs js
  LEFT JOIN compensation_credits pc
    ON pc.user_id = js.user_id AND pc.applied_at IS NULL
  GROUP BY js.july_sub_id, js.user_id
),
entitlements AS (
  SELECT
    js.user_id,
    GREATEST(
      GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other),
      CASE
        WHEN GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other) > 0
          THEN 0
        ELSE ct.closure_credit_days
      END
    ) + ct.other_credit_days AS expected_entitlement_days
  FROM july_subs js
  JOIN selected_counts sc ON sc.july_sub_id = js.july_sub_id
  JOIN carryover_used cu ON cu.july_sub_id = js.july_sub_id
  JOIN credit_totals ct ON ct.july_sub_id = js.july_sub_id
),
over_claimed AS (
  SELECT
    aug.id AS aug_sub_id,
    e.expected_entitlement_days
  FROM subscriptions aug
  JOIN august_period ap ON ap.id = aug.period_id
  JOIN entitlements e ON e.user_id = aug.user_id
  WHERE aug.payment_status = 'pending'
    AND COALESCE(aug.carryover_delivery_days, 0) > e.expected_entitlement_days
),
released_credits AS (
  UPDATE compensation_credits cc
  SET applied_to_subscription_id = NULL
  FROM over_claimed oc
  WHERE cc.applied_to_subscription_id = oc.aug_sub_id
    AND cc.applied_at IS NULL
  RETURNING cc.id
)
UPDATE subscriptions aug
SET carryover_delivery_days = oc.expected_entitlement_days
FROM over_claimed oc
WHERE aug.id = oc.aug_sub_id;


-- ─── 4. PREVIEW: confirm no over-claimed pending subs remain ───────────────

WITH july_period AS (
  SELECT id FROM subscription_periods
  WHERE delivery_start <= '2026-07-30' AND delivery_end >= '2026-07-30'
  ORDER BY delivery_start DESC LIMIT 1
),
august_period AS (
  SELECT id, target_month FROM subscription_periods
  WHERE delivery_start >= '2026-08-01' AND delivery_start < '2026-09-01'
  ORDER BY delivery_start LIMIT 1
),
july_subs AS (
  SELECT
    s.id AS july_sub_id,
    s.user_id,
    COALESCE(s.total_delivery_days, COALESCE(s.frequency_per_week, 0) * 4) AS effective_total_days
  FROM subscriptions s
  JOIN july_period jp ON jp.id = s.period_id
  WHERE s.payment_status = 'completed' AND s.closure_reselection_required = true
),
selected_counts AS (
  SELECT js.july_sub_id, COALESCE(SUM(cardinality(dd.selected_days)), 0) AS selected_count
  FROM july_subs js
  LEFT JOIN delivery_days dd ON dd.subscription_id = js.july_sub_id
  GROUP BY js.july_sub_id
),
carryover_used AS (
  SELECT
    js.july_sub_id,
    COALESCE(SUM(other.carryover_delivery_days), 0) AS used_by_other
  FROM july_subs js
  LEFT JOIN subscriptions other
    ON other.carryover_from_subscription_id = js.july_sub_id
    AND NOT (
      other.user_id = js.user_id
      AND other.payment_status = 'pending'
      AND other.period_id = (SELECT id FROM august_period)
    )
  GROUP BY js.july_sub_id
),
credit_totals AS (
  SELECT
    js.july_sub_id,
    js.user_id,
    COALESCE(SUM(pc.days) FILTER (
      WHERE pc.admin_notes IS DISTINCT FROM 'closure:2026-07-30'
        OR pc.source_subscription_id IS DISTINCT FROM js.july_sub_id
        OR pc.source_subscription_id IS NULL
    ), 0) AS other_credit_days,
    COALESCE(SUM(pc.days) FILTER (
      WHERE pc.admin_notes = 'closure:2026-07-30'
        AND pc.source_subscription_id = js.july_sub_id
    ), 0) AS closure_credit_days
  FROM july_subs js
  LEFT JOIN compensation_credits pc
    ON pc.user_id = js.user_id AND pc.applied_at IS NULL
  GROUP BY js.july_sub_id, js.user_id
),
entitlements AS (
  SELECT
    js.user_id,
    GREATEST(
      GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other),
      CASE
        WHEN GREATEST(0, js.effective_total_days - sc.selected_count - cu.used_by_other) > 0
          THEN 0
        ELSE ct.closure_credit_days
      END
    ) + ct.other_credit_days AS expected_entitlement_days
  FROM july_subs js
  JOIN selected_counts sc ON sc.july_sub_id = js.july_sub_id
  JOIN carryover_used cu ON cu.july_sub_id = js.july_sub_id
  JOIN credit_totals ct ON ct.july_sub_id = js.july_sub_id
)
SELECT
  p.real_name,
  ap.target_month,
  COALESCE(aug.carryover_delivery_days, 0) AS aug_carryover_days,
  e.expected_entitlement_days,
  aug.payment_status
FROM subscriptions aug
JOIN august_period ap ON ap.id = aug.period_id
JOIN profiles p ON p.id = aug.user_id
JOIN entitlements e ON e.user_id = aug.user_id
WHERE aug.payment_status = 'pending'
  AND COALESCE(aug.carryover_delivery_days, 0) > e.expected_entitlement_days;

-- Should return 0 rows after section 3.
