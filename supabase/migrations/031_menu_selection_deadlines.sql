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
