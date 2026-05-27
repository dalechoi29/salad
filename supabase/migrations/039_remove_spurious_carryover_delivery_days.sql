-- Migration 039: Remove delivery_day rows that were erroneously added by
-- migration 038.
--
-- PROBLEM: Migration 038 not only updated carryover metadata on subscriptions
-- but also MERGED the source subscription's cross-period delivery_days into the
-- target subscription's delivery_days (e.g., 김은아's June sub went from 5 dates
-- to 9 after the merge). This was wrong: carryover is a day-count entitlement,
-- not tied to specific pre-selected dates. The user may have deliberately chosen
-- different dates, and the merge added unwanted extra deliveries.
--
-- FIX: For every subscription where carryover_from_subscription_id is set
-- (populated by migration 038), remove from its delivery_days any (week_start,
-- day_num) tuples that came from the source subscription and fall within the
-- target period's delivery window. Only pending (미결제) subscriptions are
-- touched; paid subscriptions are left as-is.
--
-- NOTE: If a user's own selection happened to coincide with a cross-period date
-- that day will also be removed. The user can simply re-select it.  This edge
-- case is accepted because the pre-selected makeup dates are typically different
-- from the user's regular delivery days.

DO $$
DECLARE
  v_source_sub_id   UUID;
  v_target_sub_id   UUID;
  v_delivery_start  DATE;
  v_delivery_end    DATE;
  v_week_start      DATE;
  v_day_num         INT;
BEGIN
  FOR v_source_sub_id, v_target_sub_id, v_delivery_start, v_delivery_end IN
    SELECT
      ts.carryover_from_subscription_id AS source_sub_id,
      ts.id                             AS target_sub_id,
      tp.delivery_start,
      tp.delivery_end
    FROM  subscriptions ts
    JOIN  subscription_periods tp ON tp.id = ts.period_id
    WHERE ts.carryover_from_subscription_id IS NOT NULL
      AND ts.carryover_delivery_days        >  0
      AND ts.payment_status                 = 'pending'
      AND tp.delivery_start                 IS NOT NULL
      AND tp.delivery_end                   IS NOT NULL
      -- Only proceed if the source sub actually has cross-period dates that
      -- are also present in the target sub's delivery_days (proof that the
      -- merge happened).
      AND EXISTS (
            SELECT 1
            FROM   delivery_days src_dd
            CROSS  JOIN LATERAL UNNEST(src_dd.selected_days) AS d
            WHERE  src_dd.subscription_id = ts.carryover_from_subscription_id
              AND  (src_dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
                   BETWEEN tp.delivery_start AND tp.delivery_end
              AND  EXISTS (
                     SELECT 1 FROM delivery_days tgt_dd
                     WHERE  tgt_dd.subscription_id = ts.id
                       AND  tgt_dd.week_start       = src_dd.week_start
                       AND  d = ANY(tgt_dd.selected_days)
                   )
          )
  LOOP
    -- Remove each cross-period (week_start, day_num) from the target sub
    FOR v_week_start, v_day_num IN
      SELECT DISTINCT src_dd.week_start, d
      FROM   delivery_days src_dd
      CROSS  JOIN LATERAL UNNEST(src_dd.selected_days) AS d
      WHERE  src_dd.subscription_id = v_source_sub_id
        AND  (src_dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
             BETWEEN v_delivery_start AND v_delivery_end
    LOOP
      UPDATE delivery_days
      SET    selected_days = ARRAY(
               SELECT x FROM UNNEST(selected_days) AS x WHERE x <> v_day_num
             )
      WHERE  subscription_id = v_target_sub_id
        AND  week_start       = v_week_start
        AND  v_day_num        = ANY(selected_days);
    END LOOP;

    -- Clean up any weeks that are now empty
    DELETE FROM delivery_days
    WHERE  subscription_id = v_target_sub_id
      AND  selected_days   = '{}';
  END LOOP;
END $$;
