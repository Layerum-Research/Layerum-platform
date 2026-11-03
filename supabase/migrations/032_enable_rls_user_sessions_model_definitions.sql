ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sessions_select_own" ON public.user_sessions;
CREATE POLICY "user_sessions_select_own"
ON public.user_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

ALTER TABLE public.model_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_definitions_select_authenticated" ON public.model_definitions;
CREATE POLICY "model_definitions_select_authenticated"
ON public.model_definitions
FOR SELECT
TO authenticated
USING (true);
