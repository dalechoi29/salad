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
