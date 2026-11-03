export type StorageBackend = 'none' | 's3' | 'supabase_legacy';

export type StorageUploadResult = {
  objectKey: string;
  fileSize: number;
  checksum?: string;
};

export type PresignedUpload = {
  objectKey: string;
  uploadUrl: string;
  method: 'POST';
  fields: Record<string, string>;
  expiresInSeconds: number;
};

export type StorageObjectHead = {
  contentLength: number | null;
  contentType: string | null;
  eTag: string | null;
};
