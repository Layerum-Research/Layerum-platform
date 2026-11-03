ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.reserve_upload_session(UUID, UUID, UUID, TEXT, BIGINT, TIMESTAMPTZ)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.finalize_upload_session(UUID, UUID, UUID, UUID, BIGINT)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.claim_upload_sessions_for_cleanup(INTEGER)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.mark_upload_session_cleanup_result(UUID, BOOLEAN, TEXT)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.abort_upload_session(UUID, TEXT)
  SET search_path = public, pg_temp;
