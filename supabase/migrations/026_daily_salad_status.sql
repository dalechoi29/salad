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
