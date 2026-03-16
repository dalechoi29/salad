-- Fix all RLS policies that use hardcoded role = 'admin'
-- to use is_admin() instead (which covers both 'admin' and 'super_admin')

-- ─── subscription_periods ────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage subscription periods" ON subscription_periods;
CREATE POLICY "Admins can manage subscription periods"
  ON subscription_periods FOR ALL
  USING (is_admin());

GRANT INSERT, UPDATE, DELETE ON subscription_periods TO authenticated;

-- ─── subscriptions ───────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON subscriptions;
CREATE POLICY "Admins can read all subscriptions"
  ON subscriptions FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON subscriptions;
CREATE POLICY "Admins can manage all subscriptions"
  ON subscriptions FOR ALL
  USING (is_admin());

-- ─── profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin());

-- ─── allowed_domains ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage allowed domains" ON allowed_domains;
CREATE POLICY "Admins can manage allowed domains"
  ON allowed_domains FOR ALL
  USING (is_admin());

-- ─── posts (admin delete) ────────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own posts" ON posts;
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  USING (auth.uid() = user_id OR is_admin());

-- ─── comments (admin delete) ────────────────────────────────
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id OR is_admin());
