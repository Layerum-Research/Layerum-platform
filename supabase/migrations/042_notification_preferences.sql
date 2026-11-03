CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  system_health_in_app BOOLEAN NOT NULL DEFAULT TRUE,
  system_health_email  BOOLEAN NOT NULL DEFAULT FALSE,
  api_usage_in_app     BOOLEAN NOT NULL DEFAULT TRUE,
  api_usage_email      BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'api_key_created',
    'api_key_revoked',
    'api_key_rotated',
    'api_key_token_usage_warning',
    'workspace_invite_accepted',
    'ingestion_failed',
    'storage_quota_warning',
    'storage_quota_reached',
    'system_health_down',
    'system_health_recovered'
  )
);

ALTER TABLE workspace_api_keys
  ADD COLUMN IF NOT EXISTS token_usage_alerted_on DATE;
