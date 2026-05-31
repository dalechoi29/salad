-- Migration 044: Delivery skip / vacation postponement
-- Creates skipped_delivery_days table and adds source_subscription_id
-- to compensation_credits for linking vacation-skip credits.

-- 1. Track per-date skips (separate table since delivery_days uses week+day arrays)
CREATE TABLE IF NOT EXISTS skipped_delivery_days (
  id                    uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id       uuid        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  delivery_date         date        NOT NULL,
  skipped_by            uuid        REFERENCES profiles(id),
  skip_reason           text,
  compensation_credit_id uuid       REFERENCES compensation_credits(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, delivery_date)
);

-- RLS
ALTER TABLE skipped_delivery_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skips_users_read_own" ON skipped_delivery_days
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "skips_users_insert_own" ON skipped_delivery_days
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "skips_users_delete_own" ON skipped_delivery_days
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "skips_admins_all" ON skipped_delivery_days
  FOR ALL USING (is_admin());

-- 2. Add source_subscription_id to compensation_credits so vacation-skip
--    credits can be found by their originating subscription.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'compensation_credits'
      AND column_name = 'source_subscription_id'
  ) THEN
    ALTER TABLE compensation_credits
      ADD COLUMN source_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL;
  END IF;
END $$;
