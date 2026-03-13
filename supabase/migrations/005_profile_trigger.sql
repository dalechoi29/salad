-- =============================================
-- Auto-create profile on user signup
-- This trigger runs when a new user is inserted
-- into auth.users, creating the matching profile.
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, real_name, nickname, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'real_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'nickname', ''),
    'user',
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
