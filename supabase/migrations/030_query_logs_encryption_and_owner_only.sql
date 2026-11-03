ALTER TABLE query_logs
  ADD COLUMN IF NOT EXISTS query_text_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS query_text_iv TEXT,
  ADD COLUMN IF NOT EXISTS query_text_tag TEXT,
  ADD COLUMN IF NOT EXISTS query_text_enc_version INTEGER,
  ADD COLUMN IF NOT EXISTS answer_text_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS answer_text_iv TEXT,
  ADD COLUMN IF NOT EXISTS answer_text_tag TEXT,
  ADD COLUMN IF NOT EXISTS answer_text_enc_version INTEGER;

DROP POLICY IF EXISTS "query_logs_select" ON query_logs;

CREATE POLICY "query_logs_select" ON query_logs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id
      FROM workspace_users
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );
