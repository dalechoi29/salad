-- Admin notifications for delivery schedule changes (postpone / reschedule).

CREATE TABLE IF NOT EXISTS admin_notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT        NOT NULL CHECK (type IN ('delivery_postpone', 'delivery_reschedule')),
  actor_user_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  target_user_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID        REFERENCES subscriptions(id) ON DELETE SET NULL,
  message         TEXT        NOT NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_created_at_idx
  ON admin_notifications (created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notification_reads (
  notification_id UUID        NOT NULL REFERENCES admin_notifications(id) ON DELETE CASCADE,
  admin_user_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, admin_user_id)
);

CREATE INDEX IF NOT EXISTS admin_notification_reads_admin_idx
  ON admin_notification_reads (admin_user_id);

ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_notifications"
  ON admin_notifications FOR SELECT
  USING (is_admin());

CREATE POLICY "admins_manage_own_reads"
  ON admin_notification_reads FOR ALL
  USING (auth.uid() = admin_user_id)
  WITH CHECK (auth.uid() = admin_user_id);

GRANT SELECT ON admin_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_notification_reads TO authenticated;

COMMENT ON TABLE admin_notifications IS
  'Feed of user delivery schedule changes visible to admins (postpone, same-month reschedule).';
