CREATE TABLE entities (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type_id UUID NOT NULL REFERENCES entity_types(id) ON DELETE RESTRICT,
  parent_id      UUID REFERENCES entities(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  metadata       JSONB NOT NULL DEFAULT '{}',
  path           TEXT[] NOT NULL DEFAULT '{}',
  depth          INTEGER NOT NULL DEFAULT 0,
  created_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_workspace ON entities(workspace_id);
CREATE INDEX idx_entities_parent ON entities(parent_id);
CREATE INDEX idx_entities_type ON entities(entity_type_id);
CREATE INDEX idx_entities_path ON entities USING GIN(path);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entities_select" ON entities
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );

CREATE POLICY "entities_insert" ON entities
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "entities_update" ON entities
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'editor')
    )
  );

CREATE POLICY "entities_delete" ON entities
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION sync_entity_path()
RETURNS TRIGGER AS $$
DECLARE
  parent_path TEXT[];
  parent_depth INTEGER;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path = ARRAY[NEW.id::TEXT];
    NEW.depth = 0;
  ELSE
    SELECT path, depth INTO parent_path, parent_depth
    FROM entities WHERE id = NEW.parent_id;
    NEW.path = parent_path || NEW.id::TEXT;
    NEW.depth = parent_depth + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entity_path
  BEFORE INSERT OR UPDATE OF parent_id ON entities
  FOR EACH ROW EXECUTE FUNCTION sync_entity_path();

CREATE TABLE entity_permissions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_id    UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL,
  granted_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_id, user_id, permission)
);

CREATE INDEX idx_entity_permissions_entity ON entity_permissions(entity_id);
CREATE INDEX idx_entity_permissions_user ON entity_permissions(user_id);

ALTER TABLE entity_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_permissions_select" ON entity_permissions
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid())
  );
