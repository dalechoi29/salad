-- Allow authenticated users to read their own admin_permissions rows.
--
-- Previously, the only policy on admin_permissions restricted ALL operations
-- to super_admin, which meant a regular admin could not read their own
-- permissions. As a result, features gated by per-user permissions (e.g. the
-- "Report" navigation tab, the "납품 보고서" admin menu card, and the vendor
-- report server action) silently failed for assigned admins.
--
-- The application server code was updated to use the service role client for
-- these reads, but we also add a proper RLS policy so that the permission
-- model is self-consistent at the database layer.

CREATE POLICY "users_read_own_admin_permissions" ON admin_permissions
  FOR SELECT
  USING (user_id = auth.uid());

-- Backfill: every existing admin who already has at least one permission
-- assigned should retain access to "오늘의 샐러드", which used to be visible
-- to every admin regardless of permissions. Without this backfill, adding
-- the new `todays_salad` permission key would remove access silently.
INSERT INTO admin_permissions (user_id, permission)
SELECT DISTINCT p.id, 'todays_salad'
FROM profiles p
JOIN admin_permissions ap ON ap.user_id = p.id
WHERE p.role = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM admin_permissions existing
    WHERE existing.user_id = p.id
      AND existing.permission = 'todays_salad'
  );
