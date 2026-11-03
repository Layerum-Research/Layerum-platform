CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash      TEXT NOT NULL UNIQUE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_prefix
  ON oauth_access_tokens(token_prefix);

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_user
  ON oauth_access_tokens(user_id, created_at DESC);

ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_access_tokens ENABLE ROW LEVEL SECURITY;
