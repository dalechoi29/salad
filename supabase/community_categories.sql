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
