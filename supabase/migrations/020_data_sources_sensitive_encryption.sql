ALTER TABLE data_sources
  ADD COLUMN source_url_ciphertext TEXT,
  ADD COLUMN source_url_iv TEXT,
  ADD COLUMN source_url_tag TEXT,
  ADD COLUMN raw_text_ciphertext TEXT,
  ADD COLUMN raw_text_iv TEXT,
  ADD COLUMN raw_text_tag TEXT,
  ADD COLUMN sensitive_enc_version INTEGER;

CREATE INDEX idx_data_sources_sensitive_enc_version
  ON data_sources(sensitive_enc_version);
