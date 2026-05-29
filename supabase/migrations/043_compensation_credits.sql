-- Migration 043: compensation_credits table
--
-- Tracks free-delivery-day entitlements owed to subscribers that are
-- independent of the normal store-closure carryover chain.
-- Primary use-case: subscribers who were overcharged because the carryover
-- discount was not applied to their payment at the time (이유화, 최정인, 정희성).
-- Admins manage these credits through /admin/compensation.
-- When a subscriber creates their next subscription, pending credits are
-- automatically consumed as free bonus delivery days.

CREATE TABLE IF NOT EXISTS compensation_credits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  days            INTEGER     NOT NULL CHECK (days > 0),
  source_period   TEXT        NOT NULL,   -- e.g. "2026년 6월"
  reason          TEXT,                   -- human-readable description
  admin_notes     TEXT,
  applied_to_subscription_id UUID REFERENCES subscriptions(id),
  applied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compensation_credits_user_id_idx
  ON compensation_credits (user_id);

CREATE INDEX IF NOT EXISTS compensation_credits_applied_idx
  ON compensation_credits (user_id)
  WHERE applied_to_subscription_id IS NULL;

COMMENT ON TABLE compensation_credits IS
  'Admin-managed free-delivery-day entitlements owed to subscribers (e.g. from overpayment or missed compensation). Consumed automatically when the user creates their next subscription.';

ALTER TABLE compensation_credits ENABLE ROW LEVEL SECURITY;

-- Users can see their own pending/applied credits
CREATE POLICY "users_read_own_compensation_credits"
  ON compensation_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "admins_manage_compensation_credits"
  ON compensation_credits FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON compensation_credits TO authenticated;
