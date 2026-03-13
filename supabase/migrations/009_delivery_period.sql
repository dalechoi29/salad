-- Add delivery period to subscription_periods
ALTER TABLE subscription_periods
  ADD COLUMN IF NOT EXISTS delivery_start DATE,
  ADD COLUMN IF NOT EXISTS delivery_end DATE;
