ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS total_delivery_days INTEGER;

UPDATE subscriptions s
SET total_delivery_days = (
  SELECT COALESCE(SUM(array_length(dd.selected_days, 1)), 0)
  FROM delivery_days dd
  WHERE dd.subscription_id = s.id
)
WHERE s.total_delivery_days IS NULL;
