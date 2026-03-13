-- =============================================
-- Phase 4: Menu System
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Menus catalog (admin creates salad menu items)
CREATE TABLE IF NOT EXISTS menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sauce TEXT NOT NULL DEFAULT '',
  protein INTEGER,
  kcal INTEGER,
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'salad' CHECK (category IN ('salad', 'sandwich', 'bowl')),
  is_main BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER menus_updated_at
  BEFORE UPDATE ON menus
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Daily menu assignments (admin assigns menus to delivery dates)
CREATE TABLE IF NOT EXISTS daily_menu_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_date DATE NOT NULL,
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL DEFAULT 'main' CHECK (slot_type IN ('main', 'optional')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(delivery_date, menu_id)
);

-- User menu selections (user picks one menu per delivery date)
CREATE TABLE IF NOT EXISTS user_menu_selections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  daily_menu_id UUID NOT NULL REFERENCES daily_menu_assignments(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, delivery_date)
);

-- Menu favorites
CREATE TABLE IF NOT EXISTS menu_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, menu_id)
);

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_menu_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_menu_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_favorites ENABLE ROW LEVEL SECURITY;

-- Menus: everyone can read active menus
CREATE POLICY "Anyone can read menus"
  ON menus FOR SELECT
  USING (true);

-- Menus: only admins can manage
CREATE POLICY "Admins can manage menus"
  ON menus FOR ALL
  USING (is_admin());

-- Daily menu assignments: everyone can read
CREATE POLICY "Anyone can read daily menu assignments"
  ON daily_menu_assignments FOR SELECT
  USING (true);

-- Daily menu assignments: only admins can manage
CREATE POLICY "Admins can manage daily menu assignments"
  ON daily_menu_assignments FOR ALL
  USING (is_admin());

-- User menu selections: users can read their own
CREATE POLICY "Users can read own menu selections"
  ON user_menu_selections FOR SELECT
  USING (auth.uid() = user_id);

-- User menu selections: users can insert their own
CREATE POLICY "Users can create own menu selections"
  ON user_menu_selections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User menu selections: users can update their own
CREATE POLICY "Users can update own menu selections"
  ON user_menu_selections FOR UPDATE
  USING (auth.uid() = user_id);

-- User menu selections: users can delete their own
CREATE POLICY "Users can delete own menu selections"
  ON user_menu_selections FOR DELETE
  USING (auth.uid() = user_id);

-- User menu selections: admins can read all
CREATE POLICY "Admins can read all menu selections"
  ON user_menu_selections FOR SELECT
  USING (is_admin());

-- Menu favorites: users can manage their own
CREATE POLICY "Users can read own favorites"
  ON menu_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own favorites"
  ON menu_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON menu_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- Permissions
-- =============================================

GRANT SELECT ON menus TO anon, authenticated;
GRANT ALL ON menus TO authenticated;
GRANT SELECT ON daily_menu_assignments TO anon, authenticated;
GRANT ALL ON daily_menu_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_menu_selections TO authenticated;
GRANT SELECT, INSERT, DELETE ON menu_favorites TO authenticated;

-- =============================================
-- Storage bucket for menu images
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view menu images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-images');

CREATE POLICY "Admins can upload menu images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY "Admins can update menu images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'menu-images');

CREATE POLICY "Admins can delete menu images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'menu-images');
