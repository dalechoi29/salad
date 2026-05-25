
-- ============================================================
-- Migration: 001_auth_tables.sql
-- ============================================================
-- =============================================
-- Phase 1: Auth & User Management Tables
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Allowed email domains table
CREATE TABLE IF NOT EXISTS allowed_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default allowed domain
INSERT INTO allowed_domains (domain) VALUES ('siemens-healthineers.com')
ON CONFLICT (domain) DO NOTHING;

-- User profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  real_name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disabled')),
  pickup_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security (RLS) Policies
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_domains ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Profiles: Users can update their own nickname
CREATE POLICY "Users can update own nickname"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles: Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Profiles: Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Profiles: Allow insert during signup (service role handles this)
CREATE POLICY "Allow insert for authenticated users"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allowed domains: Everyone can read (needed for signup validation)
CREATE POLICY "Anyone can read allowed domains"
  ON allowed_domains FOR SELECT
  USING (true);

-- Allowed domains: Only admins can manage
CREATE POLICY "Admins can manage allowed domains"
  ON allowed_domains FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- Grant table-level permissions to Supabase roles
-- (Required for RLS policies to be evaluated)
-- =============================================
GRANT SELECT ON allowed_domains TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- =============================================
-- Create the first admin user (run after signup)
-- Replace 'YOUR_USER_ID' with the actual UUID
-- =============================================
-- UPDATE profiles SET role = 'admin', status = 'approved' WHERE email = 'your-admin@siemens-healthineers.com';


-- ============================================================
-- Migration: 002_subscription_tables.sql
-- ============================================================
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


-- ============================================================
-- Migration: 003_fix_permissions.sql
-- ============================================================
-- =============================================
-- Fix: Grant table permissions to Supabase roles
-- Without these, RLS policies are never evaluated
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Allow anon and authenticated roles to read allowed_domains
GRANT SELECT ON allowed_domains TO anon, authenticated;

-- Allow authenticated users to use profiles table
GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;

-- Allow anon to read allowed_domains (for signup validation)
GRANT SELECT ON allowed_domains TO anon;

-- Subscription tables
GRANT SELECT ON subscription_periods TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;


-- ============================================================
-- Migration: 004_fix_rls_recursion.sql
-- ============================================================
-- =============================================
-- Fix: RLS infinite recursion on profiles table
-- The admin policies on allowed_domains and profiles
-- both query profiles, causing circular recursion.
-- Solution: Use a SECURITY DEFINER function that
-- bypasses RLS to check admin status.
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Create a helper function that bypasses RLS to check admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop all problematic policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can manage allowed domains" ON allowed_domains;

-- Recreate profiles policies using the helper function
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (auth.uid() = id OR is_admin());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (auth.uid() = id OR is_admin());

-- Recreate allowed_domains admin policy
CREATE POLICY "Admins can manage allowed domains"
  ON allowed_domains
  FOR ALL
  USING (is_admin());


-- ============================================================
-- Migration: 005_profile_trigger.sql
-- ============================================================
-- Profile creation is handled explicitly via the create_profile RPC
-- called from the app's signup action after supabase.auth.signUp().
-- A trigger on auth.users is intentionally NOT used here because
-- Supabase Auth wraps the auth.users INSERT in a transaction and
-- any trigger failure surfaces as "Database error saving new user"
-- with no useful diagnostic info.

-- Remove any legacy trigger if present
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- RPC called explicitly from the signup server action
CREATE OR REPLACE FUNCTION create_profile(
  user_id UUID,
  user_email TEXT,
  user_real_name TEXT,
  user_nickname TEXT
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO profiles (id, email, real_name, nickname, role, status)
  VALUES (user_id, user_email, user_real_name, user_nickname, 'user', 'pending')
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_profile TO anon, authenticated;


-- ============================================================
-- Migration: 006_approve_user_rpc.sql
-- ============================================================
-- RPC function for admin to approve users and set their password
-- Uses SECURITY DEFINER to bypass RLS and directly update auth.users
CREATE OR REPLACE FUNCTION approve_user(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE auth.users
  SET 
    encrypted_password = crypt(new_password, gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = target_user_id;

  UPDATE profiles
  SET status = 'approved'
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION approve_user TO authenticated;


-- ============================================================
-- Migration: 007_subscription_adjustments.sql
-- ============================================================
-- Add price_per_salad to subscription_periods (admin sets per-salad price)
ALTER TABLE subscription_periods
  ADD COLUMN IF NOT EXISTS price_per_salad INTEGER NOT NULL DEFAULT 0;

-- Make payment_method nullable (user sets it later, not during initial subscription)
ALTER TABLE subscriptions
  ALTER COLUMN payment_method DROP NOT NULL,
  ALTER COLUMN payment_method DROP DEFAULT;


-- ============================================================
-- Migration: 008_delivery_holiday_tables.sql
-- ============================================================
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


-- ============================================================
-- Migration: 009_delivery_period.sql
-- ============================================================
-- Add delivery period to subscription_periods
ALTER TABLE subscription_periods
  ADD COLUMN IF NOT EXISTS delivery_start DATE,
  ADD COLUMN IF NOT EXISTS delivery_end DATE;


-- ============================================================
-- Migration: 010_holiday_cleanup_function.sql
-- ============================================================
-- SECURITY DEFINER function to remove delivery day selections
-- that conflict with a newly added holiday.
-- ISODOW: 1=Monday ... 7=Sunday (matches our 1=Mon ... 5=Fri system)
CREATE OR REPLACE FUNCTION cleanup_delivery_days_for_holiday(holiday_date_param DATE)
RETURNS VOID AS $$
DECLARE
  dow INTEGER;
  week_start_date DATE;
BEGIN
  dow := EXTRACT(ISODOW FROM holiday_date_param)::INTEGER;

  IF dow > 5 THEN RETURN; END IF;

  week_start_date := holiday_date_param - (dow - 1);

  UPDATE delivery_days
  SET selected_days = array_remove(selected_days, dow),
      updated_at = NOW()
  WHERE week_start = week_start_date
    AND dow = ANY(selected_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_delivery_days_for_holiday TO authenticated;


-- ============================================================
-- Migration: 011_delivery_days_delete_policy.sql
-- ============================================================
-- Allow users to delete their own delivery day selections
-- Needed for bulk sync from subscription page

CREATE POLICY "Users can delete own delivery days"
  ON delivery_days FOR DELETE
  USING (auth.uid() = user_id);

GRANT DELETE ON delivery_days TO authenticated;


-- ============================================================
-- Migration: 012_menu_system.sql
-- ============================================================
-- =============================================
-- Phase 4: Menu System
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Menus catalog (admin creates salad menu items)
CREATE TABLE IF NOT EXISTS menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sauce TEXT NOT NULL DEFAULT '',
  protein INTEGER,
  kcal INTEGER,
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'salad' CHECK (category IN ('salad', 'sandwich', 'bowl')),
  is_main BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER menus_updated_at
  BEFORE UPDATE ON menus
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Daily menu assignments (admin assigns menus to delivery dates)
CREATE TABLE IF NOT EXISTS daily_menu_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_date DATE NOT NULL,
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL DEFAULT 'main' CHECK (slot_type IN ('main', 'optional')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(delivery_date, menu_id)
);

-- User menu selections (user picks one menu per delivery date)
CREATE TABLE IF NOT EXISTS user_menu_selections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  daily_menu_id UUID NOT NULL REFERENCES daily_menu_assignments(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, delivery_date)
);

-- Menu favorites
CREATE TABLE IF NOT EXISTS menu_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, menu_id)
);

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_menu_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_menu_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_favorites ENABLE ROW LEVEL SECURITY;

-- Menus: everyone can read active menus
CREATE POLICY "Anyone can read menus"
  ON menus FOR SELECT
  USING (true);

-- Menus: only admins can manage
CREATE POLICY "Admins can manage menus"
  ON menus FOR ALL
  USING (is_admin());

-- Daily menu assignments: everyone can read
CREATE POLICY "Anyone can read daily menu assignments"
  ON daily_menu_assignments FOR SELECT
  USING (true);

-- Daily menu assignments: only admins can manage
CREATE POLICY "Admins can manage daily menu assignments"
  ON daily_menu_assignments FOR ALL
  USING (is_admin());

-- User menu selections: users can read their own
CREATE POLICY "Users can read own menu selections"
  ON user_menu_selections FOR SELECT
  USING (auth.uid() = user_id);

-- User menu selections: users can insert their own
CREATE POLICY "Users can create own menu selections"
  ON user_menu_selections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User menu selections: users can update their own
CREATE POLICY "Users can update own menu selections"
  ON user_menu_selections FOR UPDATE
  USING (auth.uid() = user_id);

-- User menu selections: users can delete their own
CREATE POLICY "Users can delete own menu selections"
  ON user_menu_selections FOR DELETE
  USING (auth.uid() = user_id);

-- User menu selections: admins can read all
CREATE POLICY "Admins can read all menu selections"
  ON user_menu_selections FOR SELECT
  USING (is_admin());

-- Menu favorites: users can manage their own
CREATE POLICY "Users can read own favorites"
  ON menu_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own favorites"
  ON menu_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON menu_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- Permissions
-- =============================================

GRANT SELECT ON menus TO anon, authenticated;
GRANT ALL ON menus TO authenticated;
GRANT SELECT ON daily_menu_assignments TO anon, authenticated;
GRANT ALL ON daily_menu_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_menu_selections TO authenticated;
GRANT SELECT, INSERT, DELETE ON menu_favorites TO authenticated;

-- =============================================
-- Storage bucket for menu images
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "Admins can upload menu images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY "Admins can update menu images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'menu-images');

CREATE POLICY "Admins can delete menu images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'menu-images');


-- ============================================================
-- Migration: 013_pickup_review.sql
-- ============================================================
-- =============================================
-- Phase 5: Pickup Confirmation & Reviews
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Pickup confirmations (one per user per delivery date)
CREATE TABLE IF NOT EXISTS pickups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pickup_date)
);

-- Reviews (user reviews a menu they received)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, menu_id, pickup_date)
);

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Pickups: users manage their own
CREATE POLICY "Users can read own pickups"
  ON pickups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pickups"
  ON pickups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pickups"
  ON pickups FOR UPDATE
  USING (auth.uid() = user_id);

-- Pickups: admins can read all
CREATE POLICY "Admins can read all pickups"
  ON pickups FOR SELECT
  USING (is_admin());

-- Reviews: everyone can read all reviews
CREATE POLICY "Anyone can read reviews"
  ON reviews FOR SELECT
  USING (true);

-- Reviews: users manage their own
CREATE POLICY "Users can create own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- Permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE ON pickups TO authenticated;
GRANT SELECT ON reviews TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reviews TO authenticated;

-- =============================================
-- Storage bucket for review images
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view review images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

CREATE POLICY "Authenticated can upload review images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'review-images');

CREATE POLICY "Authenticated can delete review images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'review-images');


-- ============================================================
-- Migration: 014_community.sql
-- ============================================================
-- ============================================
-- Phase 7: Community (Posts, Comments, Votes)
-- ============================================

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  vote_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Votes table (one vote per user per post)
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1, -1)),
  UNIQUE(user_id, post_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_vote_count ON posts(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_post_id ON votes(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_post ON votes(user_id, post_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON votes TO authenticated;

-- RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Posts policies
CREATE POLICY "Anyone can read posts"
  ON posts FOR SELECT USING (true);

CREATE POLICY "Users can create posts"
  ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Comments policies
CREATE POLICY "Anyone can read comments"
  ON comments FOR SELECT USING (true);

CREATE POLICY "Users can create comments"
  ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Votes policies
CREATE POLICY "Anyone can read votes"
  ON votes FOR SELECT USING (true);

CREATE POLICY "Users can manage own votes"
  ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes"
  ON votes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes"
  ON votes FOR DELETE USING (auth.uid() = user_id);

-- Function to update vote_count on posts when votes change
CREATE OR REPLACE FUNCTION update_post_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET vote_count = vote_count + NEW.value WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE posts SET vote_count = vote_count - OLD.value + NEW.value WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET vote_count = vote_count - OLD.value WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_vote_count
  AFTER INSERT OR UPDATE OR DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION update_post_vote_count();

-- Function to update comment_count on posts
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();


-- ============================================================
-- Migration: 015_post_categories.sql
-- ============================================================
-- Add category column to posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';


-- ============================================================
-- Migration: 016_subscription_total_days.sql
-- ============================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_delivery_days INTEGER;

UPDATE subscriptions s
SET total_delivery_days = (
  SELECT COALESCE(SUM(array_length(dd.selected_days, 1)), 0)
  FROM delivery_days dd
  WHERE dd.subscription_id = s.id
)
WHERE s.total_delivery_days IS NULL;


-- ============================================================
-- Migration: 017_reset_user_password_rpc.sql
-- ============================================================
-- RPC function for admin to reset an approved user's 4-digit password
CREATE OR REPLACE FUNCTION reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reset_user_password TO authenticated;


-- ============================================================
-- Migration: 018_change_own_password_rpc.sql
-- ============================================================
-- RPC function for users to change their own 4-digit password
-- Verifies the current password before updating
CREATE OR REPLACE FUNCTION change_own_password(
  current_password TEXT,
  new_password TEXT
)
RETURNS VOID AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT encrypted_password INTO stored_hash
  FROM auth.users
  WHERE id = auth.uid();

  IF stored_hash IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF stored_hash != crypt(current_password, stored_hash) THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION change_own_password TO authenticated;


-- ============================================================
-- Migration: 019_admin_settings.sql
-- ============================================================
-- =============================================
-- Admin Settings (key-value store)
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read admin_settings"
  ON admin_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update admin_settings"
  ON admin_settings FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can insert admin_settings"
  ON admin_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE ON admin_settings TO authenticated;

-- Default values
INSERT INTO admin_settings (key, value) VALUES
  ('menu_selection_cutoff_day', '4'),
  ('menu_selection_cutoff_time', '23:59')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- Migration: 020_allow_authenticated_read_all.sql
-- ============================================================
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


-- ============================================================
-- Migration: 021_allow_anon_read_subscriptions.sql
-- ============================================================
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


-- ============================================================
-- Migration: 022_menu_selection_quantity.sql
-- ============================================================
-- =============================================
-- Add quantity support to user_menu_selections
-- Allows users with multiple salads per delivery
-- to distribute across different menus.
-- =============================================

-- Add quantity column
ALTER TABLE user_menu_selections
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Drop old constraint (one selection per user per date)
ALTER TABLE user_menu_selections
  DROP CONSTRAINT IF EXISTS user_menu_selections_user_id_delivery_date_key;

-- Add new constraint (one row per user+menu combination)
ALTER TABLE user_menu_selections
  ADD CONSTRAINT user_menu_selections_user_id_daily_menu_id_key
  UNIQUE (user_id, daily_menu_id);


-- ============================================================
-- Migration: 023_admin_roles.sql
-- ============================================================
-- Add super_admin and limited_admin roles
-- super_admin: full access (current admin behavior)
-- limited_admin: can only approve users

-- Update role check constraint to allow new roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'super_admin', 'limited_admin'));

-- Upgrade existing admin users to super_admin
UPDATE profiles SET role = 'super_admin' WHERE role = 'admin';

-- Update is_admin() to recognize all admin roles
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'limited_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- New function: check for super_admin role only
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Update approve_user RPC to allow limited_admin to approve
CREATE OR REPLACE FUNCTION approve_user(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE profiles
  SET status = 'approved', updated_at = now()
  WHERE id = target_user_id;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update reset_user_password to require super_admin
CREATE OR REPLACE FUNCTION reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- Migration: 024_admin_permissions.sql
-- ============================================================
-- Rename limited_admin → admin (legacy admin was already migrated to super_admin in 023)
UPDATE profiles SET role = 'admin' WHERE role = 'limited_admin';

-- Update role constraint: user, admin, super_admin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'super_admin'));

-- is_admin() recognizes both admin and super_admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- is_super_admin() only recognizes super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Per-user admin permissions table
CREATE TABLE IF NOT EXISTS admin_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, permission)
);

-- RLS: only super_admin can manage permissions
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_manage_permissions" ON admin_permissions
  FOR ALL USING (is_super_admin());

-- Grant access
GRANT ALL ON admin_permissions TO authenticated;


-- ============================================================
-- Migration: 025_fix_subscription_rls_roles.sql
-- ============================================================
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


-- ============================================================
-- Migration: 026_daily_salad_status.sql
-- ============================================================
-- Daily salad fridge status: tracks whether salads have been placed
-- in the fridge, their location, and an optional photo.

CREATE TABLE IF NOT EXISTS daily_salad_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status_date DATE NOT NULL UNIQUE,
  is_checked BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  photo_url TEXT,
  checked_by UUID REFERENCES profiles(id),
  helpers TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_salad_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read salad status"
  ON daily_salad_status FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage salad status"
  ON daily_salad_status FOR ALL
  USING (is_admin());

GRANT SELECT ON daily_salad_status TO authenticated;
GRANT INSERT, UPDATE, DELETE ON daily_salad_status TO authenticated;


-- ============================================================
-- Migration: 027_pickups_menu_id.sql
-- ============================================================
-- Add menu_id to pickups table for tracking which menu was picked
-- when users select at pickup time instead of pre-selecting on the menu page
ALTER TABLE pickups ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES menus(id);


-- ============================================================
-- Migration: 028_admin_permissions_self_read.sql
-- ============================================================
-- Allow authenticated users to read their own admin_permissions rows.
--
-- Previously, the only policy on admin_permissions restricted ALL operations
-- to super_admin, which meant a regular admin could not read their own
-- permissions. As a result, features gated by per-user permissions (e.g. the
-- "Report" navigation tab, the "납품 보고서" admin menu card, and the vendor
-- report server action) silently failed for assigned admins.
--
-- The application server code was updated to use the service role client for
-- these reads, but we also add a proper RLS policy so that the permission
-- model is self-consistent at the database layer.

CREATE POLICY "users_read_own_admin_permissions" ON admin_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- Backfill: every existing admin who already has at least one permission
-- assigned should retain access to "오늘의 샐러드", which used to be visible
-- to every admin regardless of permissions. Without this backfill, adding
-- the new `todays_salad` permission key would remove access silently.
INSERT INTO admin_permissions (user_id, permission)
SELECT DISTINCT p.id, 'todays_salad'
FROM profiles p
JOIN admin_permissions ap ON ap.user_id = p.id
WHERE p.role = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM admin_permissions existing
    WHERE existing.user_id = p.id
      AND existing.permission = 'todays_salad'
  );


-- ============================================================
-- Migration: 029_subscription_paid_at.sql
-- ============================================================
-- Track when a subscription's payment was marked completed.
--
-- Previously, the only timestamp we had was `updated_at`, which is bumped by
-- any row update. That makes it unreliable for reporting "when did the user
-- click the paid button". Adding an explicit `paid_at` lets us surface that
-- on the admin subscription-status page without ambiguity.
--
-- Safe to apply multiple times: column creation is idempotent, and the
-- backfill only writes rows that are currently completed and still NULL.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Backfill historical data: approximate paid_at from updated_at for any
-- subscription that is already marked completed but has no paid_at yet.
-- This is not perfectly accurate (updated_at could have been bumped by
-- later unrelated changes), but it's the best approximation available
-- and avoids leaving the column NULL for past payments.
UPDATE subscriptions
SET paid_at = updated_at
WHERE payment_status = 'completed'
  AND paid_at IS NULL;


-- ============================================================
-- Migration: 030_store_closures.sql
-- ============================================================
-- =============================================
-- Store closures
-- Allows admins to close delivery days for maintenance / owner holidays.
-- Existing selected delivery dates are removed by the server action while
-- the subscription entitlement (total_delivery_days) remains unchanged.
-- =============================================

CREATE TABLE IF NOT EXISTS store_closures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  closure_date DATE NOT NULL UNIQUE,
  reason TEXT NOT NULL DEFAULT '매장 휴무',
  memo TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE store_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read store closures" ON store_closures;
CREATE POLICY "Anyone can read store closures"
  ON store_closures FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage store closures" ON store_closures;
CREATE POLICY "Admins can manage store closures"
  ON store_closures FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT ON store_closures TO anon, authenticated;
GRANT ALL ON store_closures TO authenticated;


-- ============================================================
-- Migration: 031_menu_selection_deadlines.sql
-- ============================================================
-- =============================================
-- Weekly menu-selection deadline overrides
-- Allows admins to set an exact date/time for a specific delivery week.
-- Existing global menu_selection_cutoff_day/time remains the fallback.
-- =============================================

CREATE TABLE IF NOT EXISTS menu_selection_deadlines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  deadline_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER menu_selection_deadlines_updated_at
  BEFORE UPDATE ON menu_selection_deadlines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE menu_selection_deadlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read menu selection deadlines" ON menu_selection_deadlines;
CREATE POLICY "Anyone can read menu selection deadlines"
  ON menu_selection_deadlines FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage menu selection deadlines" ON menu_selection_deadlines;
CREATE POLICY "Admins can manage menu selection deadlines"
  ON menu_selection_deadlines FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT ON menu_selection_deadlines TO anon, authenticated;
GRANT ALL ON menu_selection_deadlines TO authenticated;


-- ============================================================
-- Migration: 032_subscription_closure_reselection.sql
-- ============================================================
-- Track whether an incomplete paid subscription needs reselection because
-- an admin-created store closure removed one or more selected dates.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS closure_reselection_required BOOLEAN NOT NULL DEFAULT false;


-- ============================================================
-- Migration: 033_subscription_carryover_days.sql
-- ============================================================
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS carryover_delivery_days INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS carryover_from_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_carryover_delivery_days_nonnegative
CHECK (carryover_delivery_days >= 0);


-- ============================================================
-- Migration: 034_subscription_holds.sql
-- ============================================================
-- Subscription hold (Phase 1): metadata table + per-subscription billing extension accumulator.
-- Application logic (shift delivery days, effective pay_end) comes in later phases.

-- Cumulative calendar days added to this subscriber's effective payment deadline
-- (구독 행만 연장; 기간 테이블은 수정하지 않음).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS hold_billing_extension_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_hold_billing_extension_days_nonnegative;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_hold_billing_extension_days_nonnegative
  CHECK (hold_billing_extension_days >= 0);

COMMENT ON COLUMN subscriptions.hold_billing_extension_days IS
  'Cumulative days extended on this subscription row for billing/deadline (hold credit); not applied to subscription_periods.';

CREATE TABLE IF NOT EXISTS subscription_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_kind TEXT NOT NULL CHECK (
    duration_kind IN (
      'weeks_1', 'weeks_2', 'weeks_3',
      'months_1', 'months_2', 'months_3', 'months_4', 'months_5', 'months_6',
      'months_7', 'months_8', 'months_9', 'months_10', 'months_11', 'months_12'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT subscription_holds_date_range CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS subscription_holds_subscription_id_idx
  ON subscription_holds (subscription_id);

CREATE INDEX IF NOT EXISTS subscription_holds_user_id_status_idx
  ON subscription_holds (user_id, status);

-- At most one non-terminal hold per subscription (enforces product rule).
CREATE UNIQUE INDEX IF NOT EXISTS subscription_holds_one_open_per_subscription
  ON subscription_holds (subscription_id)
  WHERE status IN ('scheduled', 'active');

COMMENT ON TABLE subscription_holds IS
  'Subscriber-initiated delivery/menu pause; [start_date, end_date) is half-open.';

COMMENT ON COLUMN subscription_holds.duration_kind IS
  'Requested length: weeks_1..3 or months_1..12; server derives start/end.';

CREATE TRIGGER subscription_holds_updated_at
  BEFORE UPDATE ON subscription_holds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Always align user_id with the parent subscription (ignore client-supplied mismatch).
CREATE OR REPLACE FUNCTION subscription_holds_set_user_from_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  sub_uid UUID;
BEGIN
  SELECT s.user_id INTO sub_uid
  FROM subscriptions s
  WHERE s.id = NEW.subscription_id;

  IF sub_uid IS NULL THEN
    RAISE EXCEPTION 'subscription_holds: subscription_id % not found', NEW.subscription_id;
  END IF;

  NEW.user_id := sub_uid;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscription_holds_set_user_id
  BEFORE INSERT OR UPDATE ON subscription_holds
  FOR EACH ROW
  EXECUTE FUNCTION subscription_holds_set_user_from_subscription();

ALTER TABLE subscription_holds ENABLE ROW LEVEL SECURITY;

-- Subscribers: full access only when the row belongs to their subscription.
CREATE POLICY "Users can read own subscription holds"
  ON subscription_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_holds.subscription_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own subscription holds"
  ON subscription_holds FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own subscription holds"
  ON subscription_holds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_holds.subscription_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all subscription holds"
  ON subscription_holds FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can manage all subscription holds"
  ON subscription_holds FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE ON subscription_holds TO authenticated;


-- ============================================================
-- Migration: 035_subscription_hold_eligibility.sql
-- ============================================================
-- Per-user opt-in for subscription hold UI + API (except canceling an existing hold).
-- Global master switch + allowed duration kinds live in admin_settings.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_hold_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.subscription_hold_eligible IS
  'When admin_settings.subscription_hold_master_enabled is true, this user may request/update subscription holds.';

INSERT INTO admin_settings (key, value) VALUES
  (
    'subscription_hold_master_enabled',
    'false'
  ),
  (
    'subscription_hold_allowed_duration_kinds',
    '["weeks_1","weeks_2","weeks_3","months_1","months_2","months_3","months_4","months_5","months_6","months_7","months_8","months_9","months_10","months_11","months_12"]'
  )
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- Reference data: community_categories
-- ============================================================
-- Community Categories table
CREATE TABLE IF NOT EXISTS community_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE community_categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read categories
CREATE POLICY "Anyone can read community_categories"
  ON community_categories FOR SELECT
  USING (true);

-- Only admins can modify categories
CREATE POLICY "Admins can insert community_categories"
  ON community_categories FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update community_categories"
  ON community_categories FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete community_categories"
  ON community_categories FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed default categories
INSERT INTO community_categories (key, label, color, sort_order) VALUES
  ('general', '자유', 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', 0),
  ('ceo', '사장님께 한마디', 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', 1),
  ('preference', '메뉴 취향', 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', 2),
  ('tip', '꿀팁', 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 3),
  ('etc', '기타', 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', 4)
ON CONFLICT (key) DO NOTHING;
