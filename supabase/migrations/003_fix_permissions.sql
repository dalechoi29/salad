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
