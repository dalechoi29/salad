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
