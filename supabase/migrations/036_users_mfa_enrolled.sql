-- Lets the backend report which workspace members have a verified MFA
-- factor without one Auth admin API call per user.

CREATE OR REPLACE FUNCTION users_mfa_enrolled(p_user_ids UUID[])
RETURNS TABLE (user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT f.user_id
  FROM auth.mfa_factors f
  WHERE f.user_id = ANY(p_user_ids)
    AND f.status = 'verified';
$$;

ALTER FUNCTION users_mfa_enrolled(UUID[])
  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION users_mfa_enrolled(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION users_mfa_enrolled(UUID[]) TO service_role;
