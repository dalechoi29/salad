-- =============================================
-- Allow anonymous users to read subscriptions and delivery_days
-- so the subscription status calendar is visible on the home page
-- without requiring login.
-- =============================================

-- Subscriptions: anon can read (counts only, no sensitive data)
CREATE POLICY "Anon can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (true);

-- Delivery days: anon can read
CREATE POLICY "Anon can read all delivery days"
  ON delivery_days FOR SELECT
  USING (true);

-- Profiles: anon can read (needed for disabled user filtering)
CREATE POLICY "Anon can read all profiles"
  ON profiles FOR SELECT
  USING (true);

-- Drop the more restrictive authenticated-only policies since
-- the new USING(true) policies are a superset
DROP POLICY IF EXISTS "Authenticated users can read all subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Authenticated users can read all delivery days" ON delivery_days;
DROP POLICY IF EXISTS "Authenticated users can read all profiles" ON profiles;
