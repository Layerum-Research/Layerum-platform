CREATE INDEX IF NOT EXISTS idx_query_logs_workspace_created_at
  ON query_logs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_action_resource_created_at
  ON audit_logs (workspace_id, action, resource, created_at DESC);
