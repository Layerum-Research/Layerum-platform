CREATE OR REPLACE FUNCTION authorize_user_session(
  p_user_id UUID,
  p_session_id TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT,
  p_os_name TEXT,
  p_browser_name TEXT,
  p_device_type TEXT,
  p_device_label TEXT,
  p_touch_after INTERVAL DEFAULT INTERVAL '5 minutes'
)
RETURNS TABLE (
  user_exists BOOLEAN,
  session_revoked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session user_sessions%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RETURN QUERY SELECT false, false;
    RETURN;
  END IF;

  IF p_session_id IS NULL THEN
    RETURN QUERY SELECT true, false;
    RETURN;
  END IF;

  SELECT * INTO v_session
  FROM user_sessions
  WHERE user_id = p_user_id AND session_id = p_session_id;

  IF NOT FOUND THEN
    INSERT INTO user_sessions (
      user_id, session_id, ip_address, user_agent,
      os_name, browser_name, device_type, device_label
    )
    VALUES (
      p_user_id, p_session_id, p_ip_address, p_user_agent,
      p_os_name, p_browser_name, p_device_type, p_device_label
    )
    ON CONFLICT (user_id, session_id) DO NOTHING;

    RETURN QUERY
      SELECT true, EXISTS (
        SELECT 1 FROM user_sessions
        WHERE user_id = p_user_id
          AND session_id = p_session_id
          AND revoked_at IS NOT NULL
      );
    RETURN;
  END IF;

  IF v_session.revoked_at IS NULL
     AND v_session.last_seen_at < NOW() - p_touch_after THEN
    UPDATE user_sessions
    SET
      last_seen_at = NOW(),
      ip_address = p_ip_address,
      user_agent = p_user_agent,
      os_name = p_os_name,
      browser_name = p_browser_name,
      device_type = p_device_type,
      device_label = p_device_label
    WHERE id = v_session.id AND revoked_at IS NULL;
  END IF;

  RETURN QUERY SELECT true, v_session.revoked_at IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION authorize_user_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTERVAL)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION authorize_user_session(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTERVAL)
  TO service_role;
