ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS carryover_delivery_days INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS carryover_from_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_carryover_delivery_days_nonnegative
CHECK (carryover_delivery_days >= 0);
