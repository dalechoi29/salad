-- Add menu_id to pickups table for tracking which menu was picked
-- when users select at pickup time instead of pre-selecting on the menu page
ALTER TABLE pickups ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES menus(id);
