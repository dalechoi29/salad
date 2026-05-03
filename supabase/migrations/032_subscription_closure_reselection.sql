-- Track whether an incomplete paid subscription needs reselection because
-- an admin-created store closure removed one or more selected dates.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS closure_reselection_required BOOLEAN NOT NULL DEFAULT false;
