-- Migration 038: Backfill carryover_delivery_days for subscriptions created
-- before the auto-include-carryover fix (deployed May 2026).
--
-- PROBLEM: When users pre-selected dates for next month due to store closures
-- (e.g., '김은아' chose 4 June dates in May), those dates were stored in the
-- MAY subscription's delivery_days. When they later applied for JUNE, the form
-- did not recognise those pre-selected dates as carryover, so:
--   - carryover_delivery_days = 0 on the June subscription
--   - total_delivery_days counted ALL dates (including carryover) as paid days
--
-- FIX: For every (source_sub → target_sub) pair where source_sub has delivery_days
-- that fall within target_sub's period delivery window AND target_sub has
-- carryover_delivery_days = 0:
--   1. Set target_sub.carryover_delivery_days = count of those cross-period dates
--   2. Set target_sub.total_delivery_days   = current_total - carryover_count
--      (reduces to paid days only; safe because carryover is free)
--   3. Set target_sub.carryover_from_subscription_id = source_sub.id
--   4. Merge those dates into target_sub's delivery_days (in case any are missing)
--
-- Safety: only UNPAID (payment_status = 'pending') subscriptions are updated to
-- avoid retroactively altering completed payments.  Delivery_days upserts are
-- idempotent (merges existing arrays with DISTINCT).

DO $$
DECLARE
  v_user_id             UUID;
  v_source_sub_id       UUID;
  v_target_sub_id       UUID;
  v_carryover_count     INT;
  v_current_total       INT;
  v_frequency           INT;
  v_delivery_start      DATE;
  v_delivery_end        DATE;
  v_week_start          DATE;
  v_filtered_days       INTEGER[];
BEGIN
  FOR
    v_user_id,
    v_source_sub_id,
    v_target_sub_id,
    v_carryover_count,
    v_current_total,
    v_frequency,
    v_delivery_start,
    v_delivery_end
  IN
    SELECT
      ts.user_id,
      src.id                                   AS source_sub_id,
      ts.id                                    AS target_sub_id,
      (
        SELECT COUNT(*)
        FROM   delivery_days dd
        CROSS  JOIN LATERAL UNNEST(dd.selected_days) AS d
        WHERE  dd.subscription_id = src.id
          AND  (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
               BETWEEN tp_target.delivery_start AND tp_target.delivery_end
      )                                        AS carryover_count,
      COALESCE(ts.total_delivery_days, ts.frequency_per_week * 4) AS current_total,
      ts.frequency_per_week                    AS frequency,
      tp_target.delivery_start,
      tp_target.delivery_end
    FROM  subscriptions     ts
    JOIN  subscription_periods tp_target ON tp_target.id = ts.period_id
    JOIN  subscriptions     src
          ON  src.user_id  = ts.user_id
          AND src.id      != ts.id
    JOIN  subscription_periods tp_src ON tp_src.id = src.period_id
    WHERE ts.carryover_delivery_days         = 0
      AND ts.carryover_from_subscription_id IS NULL
      AND ts.payment_status                  = 'pending'   -- do not touch paid subs
      AND tp_src.delivery_start              < tp_target.delivery_start
      AND tp_target.delivery_start          IS NOT NULL
      AND tp_target.delivery_end            IS NOT NULL
      AND EXISTS (
            SELECT 1
            FROM   delivery_days dd
            CROSS  JOIN LATERAL UNNEST(dd.selected_days) AS d
            WHERE  dd.subscription_id = src.id
              AND  (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
                   BETWEEN tp_target.delivery_start AND tp_target.delivery_end
          )
  LOOP
    CONTINUE WHEN v_carryover_count <= 0;

    -- 1. Update subscription metadata
    UPDATE subscriptions
    SET
      carryover_delivery_days        = v_carryover_count,
      carryover_from_subscription_id = v_source_sub_id,
      -- Reduce total_delivery_days to paid-only portion; floor at 0
      total_delivery_days            = GREATEST(0, v_current_total - v_carryover_count)
    WHERE id = v_target_sub_id;

    -- 2. Merge the cross-period delivery_days into the target subscription
    --    (one upsert per affected week)
    FOR v_week_start IN
      SELECT DISTINCT dd.week_start
      FROM   delivery_days dd
      CROSS  JOIN LATERAL UNNEST(dd.selected_days) AS d
      WHERE  dd.subscription_id = v_source_sub_id
        AND  (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
             BETWEEN v_delivery_start AND v_delivery_end
    LOOP
      -- Collect only the day numbers that fall within the target delivery window
      SELECT ARRAY_AGG(d ORDER BY d) INTO v_filtered_days
      FROM   delivery_days dd
      CROSS  JOIN LATERAL UNNEST(dd.selected_days) AS d
      WHERE  dd.subscription_id = v_source_sub_id
        AND  dd.week_start      = v_week_start
        AND  (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
             BETWEEN v_delivery_start AND v_delivery_end;

      CONTINUE WHEN v_filtered_days IS NULL OR array_length(v_filtered_days, 1) = 0;

      INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
      VALUES (v_user_id, v_target_sub_id, v_week_start, v_filtered_days)
      ON CONFLICT (user_id, subscription_id, week_start)
      DO UPDATE SET selected_days = ARRAY(
        SELECT DISTINCT unnest(delivery_days.selected_days || EXCLUDED.selected_days)
        ORDER  BY 1
      );
    END LOOP;
  END LOOP;
END $$;
