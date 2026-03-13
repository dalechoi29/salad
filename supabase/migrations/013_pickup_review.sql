-- =============================================
-- Phase 5: Pickup Confirmation & Reviews
-- Run this in Supabase Dashboard > SQL Editor
-- =============================================

-- Pickup confirmations (one per user per delivery date)
CREATE TABLE IF NOT EXISTS pickups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pickup_date)
);

-- Reviews (user reviews a menu they received)
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  pickup_date DATE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, menu_id, pickup_date)
);

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Pickups: users manage their own
CREATE POLICY "Users can read own pickups"
  ON pickups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own pickups"
  ON pickups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pickups"
  ON pickups FOR UPDATE
  USING (auth.uid() = user_id);

-- Pickups: admins can read all
CREATE POLICY "Admins can read all pickups"
  ON pickups FOR SELECT
  USING (is_admin());

-- Reviews: everyone can read all reviews
CREATE POLICY "Anyone can read reviews"
  ON reviews FOR SELECT
  USING (true);

-- Reviews: users manage their own
CREATE POLICY "Users can create own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- Permissions
-- =============================================

GRANT SELECT, INSERT, UPDATE ON pickups TO authenticated;
GRANT SELECT ON reviews TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON reviews TO authenticated;

-- =============================================
-- Storage bucket for review images
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('review-images', 'review-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view review images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

CREATE POLICY "Authenticated can upload review images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'review-images');

CREATE POLICY "Authenticated can delete review images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'review-images');
