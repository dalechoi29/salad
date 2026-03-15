-- =============================================
-- Enroll all approved users into March 2026 subscription
-- with specific plans per person
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

DO $$
DECLARE
  v_period_id UUID;
  v_user RECORD;
  v_sub_id UUID;
  v_freq INT;
  v_salads INT;
  v_total_days INT;
  v_week_days_normal INT[];
  v_week_days_first INT[];
  v_week_days_last INT[];
BEGIN
  -- Get the March 2026 period
  SELECT id INTO v_period_id
  FROM subscription_periods
  WHERE target_month = '2026년 3월'
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'March 2026 period not found.';
  END IF;

  -- Process each user by real_name
  FOR v_user IN
    SELECT id, real_name FROM profiles
    WHERE status = 'approved'
      AND real_name IN (
        '김혜연','오우진','이선미','윤서빈','최정인',
        '김종숙',
        '서현경','박진희','최진권','임재환','김은아','이유화','박언욱','최상욱','정상범',
        '이지선','이준수'
      )
  LOOP
    -- Determine plan based on name
    IF v_user.real_name IN ('김혜연','오우진','이선미','윤서빈','최정인') THEN
      -- Once a week (Tue), 1 per delivery
      v_freq := 1;
      v_salads := 1;
      v_week_days_normal := '{2}';
      v_week_days_first := '{2}';     -- week of 3/2: Tue 3/3 is in range
      v_week_days_last := '{2}';      -- week of 3/30: Tue 3/31 is in range
      v_total_days := 5;

    ELSIF v_user.real_name = '김종숙' THEN
      -- Once a week (Tue), 3 per delivery
      v_freq := 1;
      v_salads := 3;
      v_week_days_normal := '{2}';
      v_week_days_first := '{2}';
      v_week_days_last := '{2}';
      v_total_days := 5;

    ELSIF v_user.real_name IN ('서현경','박진희','최진권','임재환','김은아','이유화','박언욱','최상욱','정상범') THEN
      -- Twice a week (Tue, Thu), 1 per delivery
      v_freq := 2;
      v_salads := 1;
      v_week_days_normal := '{2,4}';
      v_week_days_first := '{2,4}';   -- week of 3/2: Tue 3/3, Thu 3/5 both in range
      v_week_days_last := '{2}';      -- week of 3/30: only Tue 3/31 (Thu 4/2 is out)
      v_total_days := 9;

    ELSIF v_user.real_name IN ('이지선','이준수') THEN
      -- Three times a week (Mon, Tue, Thu), 1 per delivery
      v_freq := 3;
      v_salads := 1;
      v_week_days_normal := '{1,2,4}';
      v_week_days_first := '{2,4}';   -- week of 3/2: Mon 3/2 is before delivery_start 3/3
      v_week_days_last := '{1,2}';    -- week of 3/30: Mon 3/30, Tue 3/31 (Thu 4/2 is out)
      v_total_days := 13;

    ELSE
      CONTINUE;
    END IF;

    -- Create subscription
    INSERT INTO subscriptions (
      id, user_id, period_id, frequency_per_week, salads_per_delivery,
      payment_method, payment_status, total_delivery_days
    ) VALUES (
      gen_random_uuid(), v_user.id, v_period_id, v_freq, v_salads,
      'gift_certificate', 'completed', v_total_days
    )
    ON CONFLICT (user_id, period_id) DO UPDATE SET
      frequency_per_week = v_freq,
      salads_per_delivery = v_salads,
      payment_status = 'completed',
      total_delivery_days = v_total_days
    RETURNING id INTO v_sub_id;

    -- Create delivery_days for each week in March

    -- Week of 3/2 (Mon)
    INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
    VALUES (v_user.id, v_sub_id, '2026-03-02', v_week_days_first)
    ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = EXCLUDED.selected_days;

    -- Week of 3/9 (Mon)
    INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
    VALUES (v_user.id, v_sub_id, '2026-03-09', v_week_days_normal)
    ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = EXCLUDED.selected_days;

    -- Week of 3/16 (Mon)
    INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
    VALUES (v_user.id, v_sub_id, '2026-03-16', v_week_days_normal)
    ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = EXCLUDED.selected_days;

    -- Week of 3/23 (Mon)
    INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
    VALUES (v_user.id, v_sub_id, '2026-03-23', v_week_days_normal)
    ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = EXCLUDED.selected_days;

    -- Week of 3/30 (Mon)
    INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
    VALUES (v_user.id, v_sub_id, '2026-03-30', v_week_days_last)
    ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = EXCLUDED.selected_days;

    RAISE NOTICE 'Enrolled % (freq=%, salads=%, days=%)', v_user.real_name, v_freq, v_salads, v_total_days;
  END LOOP;
END $$;
