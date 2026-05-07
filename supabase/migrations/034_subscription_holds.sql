-- Subscription hold (Phase 1): metadata table + per-subscription billing extension accumulator.
-- Application logic (shift delivery days, effective pay_end) comes in later phases.

-- Cumulative calendar days added to this subscriber's effective payment deadline
-- (구독 행만 연장; 기간 테이블은 수정하지 않음).
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS hold_billing_extension_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_hold_billing_extension_days_nonnegative;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_hold_billing_extension_days_nonnegative
  CHECK (hold_billing_extension_days >= 0);

COMMENT ON COLUMN subscriptions.hold_billing_extension_days IS
  'Cumulative days extended on this subscription row for billing/deadline (hold credit); not applied to subscription_periods.';

CREATE TABLE IF NOT EXISTS subscription_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_kind TEXT NOT NULL CHECK (
    duration_kind IN (
      'weeks_1', 'weeks_2', 'weeks_3',
      'months_1', 'months_2', 'months_3', 'months_4', 'months_5', 'months_6',
      'months_7', 'months_8', 'months_9', 'months_10', 'months_11', 'months_12'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT subscription_holds_date_range CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS subscription_holds_subscription_id_idx
  ON subscription_holds (subscription_id);

CREATE INDEX IF NOT EXISTS subscription_holds_user_id_status_idx
  ON subscription_holds (user_id, status);

-- At most one non-terminal hold per subscription (enforces product rule).
CREATE UNIQUE INDEX IF NOT EXISTS subscription_holds_one_open_per_subscription
  ON subscription_holds (subscription_id)
  WHERE status IN ('scheduled', 'active');

COMMENT ON TABLE subscription_holds IS
  'Subscriber-initiated delivery/menu pause; [start_date, end_date) is half-open.';

COMMENT ON COLUMN subscription_holds.duration_kind IS
  'Requested length: weeks_1..3 or months_1..12; server derives start/end.';

CREATE TRIGGER subscription_holds_updated_at
  BEFORE UPDATE ON subscription_holds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Always align user_id with the parent subscription (ignore client-supplied mismatch).
CREATE OR REPLACE FUNCTION subscription_holds_set_user_from_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  sub_uid UUID;
BEGIN
  SELECT s.user_id INTO sub_uid
  FROM subscriptions s
  WHERE s.id = NEW.subscription_id;

  IF sub_uid IS NULL THEN
    RAISE EXCEPTION 'subscription_holds: subscription_id % not found', NEW.subscription_id;
  END IF;

  NEW.user_id := sub_uid;
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscription_holds_set_user_id
  BEFORE INSERT OR UPDATE ON subscription_holds
  FOR EACH ROW
  EXECUTE FUNCTION subscription_holds_set_user_from_subscription();

ALTER TABLE subscription_holds ENABLE ROW LEVEL SECURITY;

-- Subscribers: full access only when the row belongs to their subscription.
CREATE POLICY "Users can read own subscription holds"
  ON subscription_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_holds.subscription_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own subscription holds"
  ON subscription_holds FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own subscription holds"
  ON subscription_holds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_holds.subscription_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.id = subscription_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all subscription holds"
  ON subscription_holds FOR SELECT
  USING (is_admin());

CREATE POLICY "Admins can manage all subscription holds"
  ON subscription_holds FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE ON subscription_holds TO authenticated;
