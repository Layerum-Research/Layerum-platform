DO $$
DECLARE
  v_function REGPROCEDURE;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'abort_upload_session',
        'authorize_user_session',
        'claim_upload_sessions_for_cleanup',
        'finalize_upload_session',
        'handle_new_user',
        'insert_notifications',
        'mark_upload_session_cleanup_result',
        'reserve_upload_session',
        'sync_entity_path',
        'update_updated_at',
        'users_mfa_enrolled',
        'workspace_peak_load',
        'workspace_query_buckets',
        'workspace_query_summary',
        'workspace_user_usage_stats'
      )
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
  END LOOP;
END;
$$;
