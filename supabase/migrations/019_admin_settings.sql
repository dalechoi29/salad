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
