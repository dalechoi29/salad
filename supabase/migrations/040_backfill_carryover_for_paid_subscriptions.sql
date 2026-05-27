-- Migration 040: Backfill carryover metadata for PAID subscriptions.
--
-- PROBLEM: Migration 038 only fixed pending (미결제) subscriptions. Some users
-- who had already paid still have carryover_delivery_days = 0 even though their
-- price correctly reflects the compensation (e.g., they were charged for 4 days
-- but have 5 selected dates — the 5th being a free makeup day from the previous
-- month's store closure). Without this field the admin cannot see the
-- "휴무 보상: +N일" banner for these users.
--
-- FIX: For completed (결제 완료) subscriptions where:
--   - carryover_delivery_days = 0 (not yet recorded)
--   - A prior subscription has delivery_days with dates in this period's window
--     (those are the pre-selected makeup dates)
-- Update ONLY carryover_delivery_days and carryover_from_subscription_id.
-- total_delivery_days is intentionally left unchanged — the user was already
-- charged the correct amount at the time of payment.

DO $$
DECLARE
  v_source_sub_id   UUID;
  v_target_sub_id   UUID;
  v_carryover_count INT;
BEGIN
  FOR v_source_sub_id, v_target_sub_id, v_carryover_count IN
    SELECT
      src.id AS source_sub_id,
      ts.id  AS target_sub_id,
      (
        SELECT COUNT(*)
        FROM   delivery_days dd
        CROSS  JOIN LATERAL UNNEST(dd.selected_days) AS d
        WHERE  dd.subscription_id = src.id
          AND  (dd.week_start + (d - 1) * INTERVAL '1 day')::DATE
               BETWEEN tp_target.delivery_start AND tp_target.delivery_end
      ) AS carryover_count
    FROM  subscriptions ts
    JOIN  subscription_periods tp_target ON tp_target.id = ts.period_id
    JOIN  subscriptions src ON (
            src.user_id = ts.user_id
            AND src.id != ts.id
          )
    JOIN  subscription_periods tp_src ON tp_src.id = src.period_id
    WHERE ts.carryover_delivery_days         = 0
      AND ts.carryover_from_subscription_id IS NULL
      AND ts.payment_status                  = 'completed'   -- paid subs only
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

    UPDATE subscriptions
    SET
      carryover_delivery_days        = v_carryover_count,
      carryover_from_subscription_id = v_source_sub_id
      -- total_delivery_days is NOT changed: the user already paid the correct amount
    WHERE id = v_target_sub_id;
  END LOOP;
END $$;
