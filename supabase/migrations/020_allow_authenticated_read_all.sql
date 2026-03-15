-- =============================================
-- Allow all authenticated users to read subscriptions,
-- delivery_days, and profiles for subscription status visibility.
-- =============================================

-- Subscriptions: all authenticated users can read
CREATE POLICY "Authenticated users can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Delivery days: all authenticated users can read
CREATE POLICY "Authenticated users can read all delivery days"
  ON delivery_days FOR SELECT
  USING (auth.role() = 'authenticated');

-- Profiles: all authenticated users can read
CREATE POLICY "Authenticated users can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');
