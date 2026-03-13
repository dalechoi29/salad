-- =============================================
-- Phase 3: Delivery Days & Holidays
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Holidays (admin-managed + API-imported)
CREATE TABLE IF NOT EXISTS holidays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery days (user selects weekdays per week)
CREATE TABLE IF NOT EXISTS delivery_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  selected_days INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, subscription_id, week_start)
);

CREATE TRIGGER delivery_days_updated_at
  BEFORE UPDATE ON delivery_days
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_days ENABLE ROW LEVEL SECURITY;

-- Holidays: everyone can read
CREATE POLICY "Anyone can read holidays"
  ON holidays FOR SELECT
  USING (true);

-- Holidays: only admins can manage
CREATE POLICY "Admins can manage holidays"
  ON holidays FOR ALL
  USING (is_admin());

-- Delivery days: users can read their own
CREATE POLICY "Users can read own delivery days"
  ON delivery_days FOR SELECT
  USING (auth.uid() = user_id);

-- Delivery days: users can insert their own
CREATE POLICY "Users can create own delivery days"
  ON delivery_days FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Delivery days: users can update their own
CREATE POLICY "Users can update own delivery days"
  ON delivery_days FOR UPDATE
  USING (auth.uid() = user_id);

-- Delivery days: admins can read all
CREATE POLICY "Admins can read all delivery days"
  ON delivery_days FOR SELECT
  USING (is_admin());

-- =============================================
-- Permissions
-- =============================================
GRANT SELECT ON holidays TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON holidays TO authenticated;
GRANT SELECT, INSERT, UPDATE ON delivery_days TO authenticated;
