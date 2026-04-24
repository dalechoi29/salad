-- Track when a subscription's payment was marked completed.
--
-- Previously, the only timestamp we had was `updated_at`, which is bumped by
-- any row update. That makes it unreliable for reporting "when did the user
-- click the paid button". Adding an explicit `paid_at` lets us surface that
-- on the admin subscription-status page without ambiguity.
--
-- Safe to apply multiple times: column creation is idempotent, and the
-- backfill only writes rows that are currently completed and still NULL.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Backfill historical data: approximate paid_at from updated_at for any
-- subscription that is already marked completed but has no paid_at yet.
-- This is not perfectly accurate (updated_at could have been bumped by
-- later unrelated changes), but it's the best approximation available
-- and avoids leaving the column NULL for past payments.
UPDATE subscriptions
SET paid_at = updated_at
WHERE payment_status = 'completed'
  AND paid_at IS NULL;
