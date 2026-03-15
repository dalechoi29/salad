-- =============================================
-- Add quantity support to user_menu_selections
-- Allows users with multiple salads per delivery
-- to distribute across different menus.
-- =============================================

-- Add quantity column
ALTER TABLE user_menu_selections
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Drop old constraint (one selection per user per date)
ALTER TABLE user_menu_selections
  DROP CONSTRAINT IF EXISTS user_menu_selections_user_id_delivery_date_key;

-- Add new constraint (one row per user+menu combination)
ALTER TABLE user_menu_selections
  ADD CONSTRAINT user_menu_selections_user_id_daily_menu_id_key
  UNIQUE (user_id, daily_menu_id);
