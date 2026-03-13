-- =============================================
-- Phase 2: Subscription System Tables
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Subscription periods (admin-configured)
CREATE TABLE IF NOT EXISTS subscription_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_month TEXT NOT NULL,
  apply_start TIMESTAMPTZ NOT NULL,
  apply_end TIMESTAMPTZ NOT NULL,
  pay_start TIMESTAMPTZ NOT NULL,
  pay_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER subscription_periods_updated_at
  BEFORE UPDATE ON subscription_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- User subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES subscription_periods(id) ON DELETE CASCADE,
  frequency_per_week INTEGER NOT NULL DEFAULT 2 CHECK (frequency_per_week BETWEEN 1 AND 5),
  salads_per_delivery INTEGER NOT NULL DEFAULT 1 CHECK (salads_per_delivery >= 1),
  payment_method TEXT NOT NULL DEFAULT 'credit_card' CHECK (payment_method IN ('credit_card', 'gift_certificate', 'bank_transfer')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, period_id)
);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Subscription periods: everyone can read
CREATE POLICY "Anyone can read subscription periods"
  ON subscription_periods FOR SELECT
  USING (true);

-- Subscription periods: only admins can manage
CREATE POLICY "Admins can manage subscription periods"
  ON subscription_periods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Subscriptions: users can read their own
CREATE POLICY "Users can read own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Subscriptions: users can insert their own
CREATE POLICY "Users can create own subscriptions"
  ON subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Subscriptions: users can update their own
CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Subscriptions: admins can read all
CREATE POLICY "Admins can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Subscriptions: admins can update all
CREATE POLICY "Admins can manage all subscriptions"
  ON subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- Grant table-level permissions to Supabase roles
-- =============================================
GRANT SELECT ON subscription_periods TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
