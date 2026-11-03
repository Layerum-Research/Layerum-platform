ALTER TABLE model_definitions
  ADD COLUMN IF NOT EXISTS family TEXT,
  ADD COLUMN IF NOT EXISTS release_date DATE,
  ADD COLUMN IF NOT EXISTS pricing JSONB,
  ADD COLUMN IF NOT EXISTS catalog_status TEXT
    CHECK (catalog_status IN ('beta', 'deprecated')),
  ADD COLUMN IF NOT EXISTS catalog_hash TEXT,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS model_catalog_sync_state (
  source TEXT PRIMARY KEY,
  etag TEXT,
  synced_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE model_catalog_sync_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sync_model_definitions(
  p_providers provider_name[],
  p_rows JSONB
)
RETURNS TABLE (inserted INTEGER, updated INTEGER, deactivated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_deactivated INTEGER := 0;
BEGIN
  CREATE TEMP TABLE incoming ON COMMIT DROP AS
  SELECT *
  FROM jsonb_to_recordset(p_rows) AS r(
    provider provider_name,
    provider_key TEXT,
    display_name TEXT,
    model_type model_type,
    family TEXT,
    context_window INTEGER,
    max_output INTEGER,
    capabilities TEXT[],
    pricing JSONB,
    release_date DATE,
    catalog_status TEXT,
    catalog_hash TEXT
  );

  WITH upserted AS (
    INSERT INTO model_definitions (
      provider, provider_key, display_name, model_type, family,
      context_window, max_output, capabilities, pricing, release_date,
      catalog_status, catalog_hash, is_active, synced_at
    )
    SELECT
      i.provider, i.provider_key, i.display_name, i.model_type, i.family,
      i.context_window, i.max_output, COALESCE(i.capabilities, '{}'),
      i.pricing, i.release_date, i.catalog_status, i.catalog_hash,
      i.catalog_status IS DISTINCT FROM 'deprecated', NOW()
    FROM incoming i
    ON CONFLICT (provider, provider_key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      model_type = EXCLUDED.model_type,
      family = EXCLUDED.family,
      context_window = EXCLUDED.context_window,
      max_output = EXCLUDED.max_output,
      capabilities = EXCLUDED.capabilities,
      pricing = EXCLUDED.pricing,
      release_date = EXCLUDED.release_date,
      catalog_status = EXCLUDED.catalog_status,
      catalog_hash = EXCLUDED.catalog_hash,
      is_active = EXCLUDED.is_active,
      synced_at = EXCLUDED.synced_at
    WHERE model_definitions.catalog_hash IS DISTINCT FROM EXCLUDED.catalog_hash
       OR model_definitions.is_active IS DISTINCT FROM EXCLUDED.is_active
    RETURNING (xmax = 0) AS was_inserted
  )
  SELECT
    COUNT(*) FILTER (WHERE was_inserted),
    COUNT(*) FILTER (WHERE NOT was_inserted)
  INTO v_inserted, v_updated
  FROM upserted;

  UPDATE model_definitions d
  SET is_active = FALSE, synced_at = NOW()
  WHERE d.provider = ANY(p_providers)
    AND d.is_active
    AND NOT EXISTS (
      SELECT 1 FROM incoming i
      WHERE i.provider = d.provider AND i.provider_key = d.provider_key
    );
  GET DIAGNOSTICS v_deactivated = ROW_COUNT;

  RETURN QUERY SELECT v_inserted, v_updated, v_deactivated;
END;
$$;

REVOKE EXECUTE ON FUNCTION sync_model_definitions(provider_name[], JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sync_model_definitions(provider_name[], JSONB)
  TO service_role;
