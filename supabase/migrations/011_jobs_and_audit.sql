CREATE TABLE ingestion_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  data_source_id  UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  status          ingestion_status NOT NULL DEFAULT 'pending',
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  steps_completed TEXT[] NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_jobs_workspace ON ingestion_jobs(workspace_id);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX idx_ingestion_jobs_data_source ON ingestion_jobs(data_source_id);

ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_jobs_select" ON ingestion_jobs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       audit_action NOT NULL,
  resource     TEXT NOT NULL,
  resource_id  UUID,
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_workspace ON audit_logs(workspace_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE TABLE billing_usage (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id           UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_id              UUID REFERENCES entities(id) ON DELETE SET NULL,
  model_config_id        UUID REFERENCES model_configs(id) ON DELETE SET NULL,
  provider_connection_id UUID REFERENCES provider_connections(id) ON DELETE SET NULL,
  resource_type          TEXT NOT NULL,
  quantity               NUMERIC NOT NULL,
  unit                   TEXT NOT NULL,
  period_start           TIMESTAMPTZ NOT NULL,
  period_end             TIMESTAMPTZ NOT NULL,
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_billing_usage_workspace ON billing_usage(workspace_id);
CREATE INDEX idx_billing_usage_period ON billing_usage(period_start, period_end);

ALTER TABLE billing_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_usage_select" ON billing_usage
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
