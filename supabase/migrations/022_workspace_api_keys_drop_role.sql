ALTER TABLE workspace_api_keys
  DROP CONSTRAINT IF EXISTS workspace_api_keys_role_allowed;

ALTER TABLE workspace_api_keys
  DROP COLUMN IF EXISTS role;
