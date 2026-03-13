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
