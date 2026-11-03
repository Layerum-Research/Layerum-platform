DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'storage_backend_type') THEN
    CREATE TYPE storage_backend_type AS ENUM ('none', 's3', 'supabase_legacy');
  END IF;
END $$;

ALTER TABLE data_sources
  ADD COLUMN IF NOT EXISTS storage_backend storage_backend_type;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_backend storage_backend_type;

UPDATE data_sources
SET storage_backend = CASE
  WHEN source_type = 'file' AND storage_path IS NOT NULL THEN 'supabase_legacy'::storage_backend_type
  ELSE 'none'::storage_backend_type
END
WHERE storage_backend IS NULL;

UPDATE documents d
SET storage_backend = COALESCE(
  ds.storage_backend,
  CASE
    WHEN d.storage_path IS NOT NULL THEN 'supabase_legacy'::storage_backend_type
    ELSE 'none'::storage_backend_type
  END
)
FROM data_sources ds
WHERE d.storage_backend IS NULL
  AND ds.id = d.data_source_id;

UPDATE documents
SET storage_backend = CASE
  WHEN storage_path IS NOT NULL THEN 'supabase_legacy'::storage_backend_type
  ELSE 'none'::storage_backend_type
END
WHERE storage_backend IS NULL;

ALTER TABLE data_sources
  ALTER COLUMN storage_backend SET DEFAULT 'none'::storage_backend_type,
  ALTER COLUMN storage_backend SET NOT NULL;

ALTER TABLE documents
  ALTER COLUMN storage_backend SET DEFAULT 'none'::storage_backend_type,
  ALTER COLUMN storage_backend SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_sources_storage_backend
  ON data_sources(storage_backend);

CREATE INDEX IF NOT EXISTS idx_documents_storage_backend
  ON documents(storage_backend);
