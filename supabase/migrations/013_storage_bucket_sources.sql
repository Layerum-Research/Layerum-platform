INSERT INTO storage.buckets (id, name, public)
SELECT 'sources', 'sources', true
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'sources'
);

UPDATE storage.buckets
SET public = true
WHERE id = 'sources';
