-- Per-user opt-in for subscription hold UI + API (except canceling an existing hold).
-- Global master switch + allowed duration kinds live in admin_settings.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_hold_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.subscription_hold_eligible IS
  'When admin_settings.subscription_hold_master_enabled is true, this user may request/update subscription holds.';

INSERT INTO admin_settings (key, value) VALUES
  (
    'subscription_hold_master_enabled',
    'false'
  ),
  (
    'subscription_hold_allowed_duration_kinds',
    '["weeks_1","weeks_2","weeks_3","months_1","months_2","months_3","months_4","months_5","months_6","months_7","months_8","months_9","months_10","months_11","months_12"]'
  )
ON CONFLICT (key) DO NOTHING;
