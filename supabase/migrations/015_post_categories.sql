-- Add category column to posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
