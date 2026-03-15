-- =============================================
-- Update payment method to bank_transfer for
-- 최진권, 이유화, 이준수 (March 2026)
-- Run this in Supabase Dashboard > SQL Editor
-- AFTER running seed_march_all_users.sql
-- =============================================

UPDATE subscriptions
SET payment_method = 'bank_transfer'
WHERE period_id = (
  SELECT id FROM subscription_periods WHERE target_month = '2026년 3월' LIMIT 1
)
AND user_id IN (
  SELECT id FROM profiles WHERE real_name IN ('최진권', '이유화', '이준수')
);
