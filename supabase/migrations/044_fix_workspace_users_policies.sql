-- The old select policy queried workspace_users from its own policy, which made every
-- policy that checks membership fail with "infinite recursion detected".
-- The old insert policy let any signed-in user add themselves to any workspace with any role.
-- Memberships are managed only by the backend through the service role, so clients get no insert policy.

DROP POLICY IF EXISTS "workspace_users_select" ON workspace_users;
DROP POLICY IF EXISTS "workspace_users_insert" ON workspace_users;

CREATE POLICY "workspace_users_select" ON workspace_users
  FOR SELECT USING (user_id = auth.uid());
