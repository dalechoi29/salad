-- Add price_per_salad to subscription_periods (admin sets per-salad price)
ALTER TABLE subscription_periods
  ADD COLUMN IF NOT EXISTS price_per_salad INTEGER NOT NULL DEFAULT 0;

-- Make payment_method nullable (user sets it later, not during initial subscription)
ALTER TABLE subscriptions
  ALTER COLUMN payment_method DROP NOT NULL,
  ALTER COLUMN payment_method DROP DEFAULT;
