CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_workspace_users_updated_at
  BEFORE UPDATE ON workspace_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_entity_types_updated_at
  BEFORE UPDATE ON entity_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_provider_connections_updated_at
  BEFORE UPDATE ON provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_model_configs_updated_at
  BEFORE UPDATE ON model_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_data_sources_updated_at
  BEFORE UPDATE ON data_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ingestion_jobs_updated_at
  BEFORE UPDATE ON ingestion_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_model_definitions_updated_at
  BEFORE UPDATE ON model_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
