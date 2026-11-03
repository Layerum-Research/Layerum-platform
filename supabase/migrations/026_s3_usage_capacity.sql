CREATE OR REPLACE FUNCTION workspace_user_usage_stats(p_workspace_ids UUID[])
RETURNS TABLE (
  workspace_id UUID,
  member_count BIGINT,
  entity_count BIGINT,
  document_count BIGINT,
  chunk_count BIGINT,
  entity_bytes BIGINT,
  document_bytes BIGINT,
  chunk_bytes BIGINT,
  usage_bytes BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH ids AS (
    SELECT unnest(p_workspace_ids)::uuid AS workspace_id
  ),
  member_stats AS (
    SELECT workspace_id, COUNT(*)::bigint AS member_count
    FROM workspace_users
    WHERE workspace_id = ANY (p_workspace_ids)
    GROUP BY workspace_id
  ),
  entity_stats AS (
    SELECT
      e.workspace_id,
      COUNT(*)::bigint AS entity_count,
      COALESCE(SUM(pg_column_size(e)), 0)::bigint AS entity_bytes
    FROM entities e
    WHERE e.workspace_id = ANY (p_workspace_ids)
    GROUP BY e.workspace_id
  ),
  document_stats AS (
    SELECT
      d.workspace_id,
      COUNT(*)::bigint AS document_count,
      COALESCE(SUM(pg_column_size(d)), 0)::bigint AS document_bytes
    FROM documents d
    WHERE d.workspace_id = ANY (p_workspace_ids)
    GROUP BY d.workspace_id
  ),
  chunk_stats AS (
    SELECT
      c.workspace_id,
      COUNT(*)::bigint AS chunk_count,
      COALESCE(SUM(pg_column_size(c)), 0)::bigint AS chunk_bytes
    FROM document_chunks c
    WHERE c.workspace_id = ANY (p_workspace_ids)
    GROUP BY c.workspace_id
  ),
  s3_stats AS (
    SELECT
      dedup.workspace_id,
      COALESCE(SUM(dedup.file_size), 0)::bigint AS s3_file_bytes
    FROM (
      SELECT
        ds.workspace_id,
        ds.storage_path,
        MAX(COALESCE(ds.file_size, 0))::bigint AS file_size
      FROM data_sources ds
      WHERE ds.workspace_id = ANY (p_workspace_ids)
        AND ds.storage_backend = 's3'
        AND ds.storage_path IS NOT NULL
      GROUP BY ds.workspace_id, ds.storage_path
    ) dedup
    GROUP BY dedup.workspace_id
  )
  SELECT
    ids.workspace_id,
    COALESCE(m.member_count, 0) AS member_count,
    COALESCE(e.entity_count, 0) AS entity_count,
    COALESCE(d.document_count, 0) AS document_count,
    COALESCE(c.chunk_count, 0) AS chunk_count,
    COALESCE(e.entity_bytes, 0) AS entity_bytes,
    COALESCE(d.document_bytes, 0) AS document_bytes,
    COALESCE(c.chunk_bytes, 0) AS chunk_bytes,
    COALESCE(e.entity_bytes, 0)
      + COALESCE(d.document_bytes, 0)
      + COALESCE(c.chunk_bytes, 0)
      + COALESCE(s3.s3_file_bytes, 0) AS usage_bytes
  FROM ids
  LEFT JOIN member_stats m ON m.workspace_id = ids.workspace_id
  LEFT JOIN entity_stats e ON e.workspace_id = ids.workspace_id
  LEFT JOIN document_stats d ON d.workspace_id = ids.workspace_id
  LEFT JOIN chunk_stats c ON c.workspace_id = ids.workspace_id
  LEFT JOIN s3_stats s3 ON s3.workspace_id = ids.workspace_id;
$$;
