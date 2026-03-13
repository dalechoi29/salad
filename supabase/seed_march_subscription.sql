-- =============================================
-- March 2026 Subscription Setup
-- Creates period + subscription + delivery days
-- for Tue/Thu schedule (frequency 2)
-- =============================================

-- Step 1: Create subscription period for March 2026
-- (adjust apply/pay dates as needed)
INSERT INTO subscription_periods (
  id, target_month, apply_start, apply_end, pay_start, pay_end, delivery_start, delivery_end
) VALUES (
  gen_random_uuid(),
  '2026년 3월',
  '2026-02-15T00:00:00+09:00',
  '2026-02-28T23:59:59+09:00',
  '2026-02-25T00:00:00+09:00',
  '2026-03-02T23:59:59+09:00',
  '2026-03-03',
  '2026-03-31'
)
ON CONFLICT DO NOTHING;

-- Step 2: Create subscription for your user
-- Replace YOUR_USER_ID with your actual auth.uid()
DO $$
DECLARE
  v_user_id UUID;
  v_period_id UUID;
  v_sub_id UUID;
BEGIN
  -- Get your user ID (first admin, or adjust the email filter)
  SELECT id INTO v_user_id
  FROM profiles
  WHERE email = 'sangwook.choi@siemens-healthineers.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found. Update the email in this script.';
  END IF;

  -- Get the March 2026 period
  SELECT id INTO v_period_id
  FROM subscription_periods
  WHERE target_month = '2026년 3월'
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'March 2026 period not found.';
  END IF;

  -- Create subscription (frequency 2 = Tue/Thu, 1 salad per delivery)
  INSERT INTO subscriptions (
    id, user_id, period_id, frequency_per_week, salads_per_delivery,
    payment_method, payment_status, total_delivery_days
  ) VALUES (
    gen_random_uuid(), v_user_id, v_period_id, 2, 1,
    'gift_certificate', 'completed', 9
  )
  ON CONFLICT (user_id, period_id) DO UPDATE SET
    frequency_per_week = 2,
    salads_per_delivery = 1,
    payment_status = 'completed',
    total_delivery_days = 9
  RETURNING id INTO v_sub_id;

  -- Step 3: Create delivery_days for each week
  -- selected_days: {2,4} = Tuesday, Thursday

  -- Week of 3/2 (Mon) → Tue 3/3, Thu 3/5
  INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
  VALUES (v_user_id, v_sub_id, '2026-03-02', '{2,4}')
  ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = '{2,4}';

  -- Week of 3/9 (Mon) → Tue 3/10, Thu 3/12
  INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
  VALUES (v_user_id, v_sub_id, '2026-03-09', '{2,4}')
  ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = '{2,4}';

  -- Week of 3/16 (Mon) → Tue 3/17, Thu 3/19
  INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
  VALUES (v_user_id, v_sub_id, '2026-03-16', '{2,4}')
  ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = '{2,4}';

  -- Week of 3/23 (Mon) → Tue 3/24, Thu 3/26
  INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
  VALUES (v_user_id, v_sub_id, '2026-03-23', '{2,4}')
  ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = '{2,4}';

  -- Week of 3/30 (Mon) → Tue 3/31 only
  INSERT INTO delivery_days (user_id, subscription_id, week_start, selected_days)
  VALUES (v_user_id, v_sub_id, '2026-03-30', '{2}')
  ON CONFLICT (user_id, subscription_id, week_start) DO UPDATE SET selected_days = '{2}';

  RAISE NOTICE 'Subscription created for user % with period % (sub_id: %)', v_user_id, v_period_id, v_sub_id;
END $$;
