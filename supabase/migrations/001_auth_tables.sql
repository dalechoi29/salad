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
