export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    publicUrl:
      process.env.SUPABASE_PUBLIC_URL ??
      process.env.SUPABASE_URL ??
      '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  },
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? '',
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE ?? 'false',
    presignTtlSeconds: process.env.S3_PRESIGN_TTL_SECONDS ?? '900',
    uploadSessionGraceSeconds:
      process.env.S3_UPLOAD_SESSION_GRACE_SECONDS ?? '300',
    serverSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION ?? 'AES256',
    sseKmsKeyId: process.env.S3_SSE_KMS_KEY_ID ?? '',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY ?? '',
  },
  workspaceEncryption: {
    provider: process.env.WORKSPACE_ENCRYPTION_PROVIDER ?? 'local_vault',
    cacheTtlMs: process.env.WORKSPACE_ENCRYPTION_CACHE_TTL_MS ?? '300000',
    localMasterKey:
      process.env.WORKSPACE_ENCRYPTION_LOCAL_MASTER_KEY ??
      process.env.ENCRYPTION_KEY ??
      '',
    awsRegion: process.env.AWS_REGION ?? 'us-east-1',
    awsKmsKeyId: process.env.WORKSPACE_ENCRYPTION_AWS_KMS_KEY_ID ?? '',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED ?? '',
    mode: process.env.RATE_LIMIT_MODE ?? 'enforce',
    prefix: process.env.RATE_LIMIT_PREFIX ?? '',
    timeoutMs: process.env.RATE_LIMIT_TIMEOUT_MS ?? '750',
    analytics: process.env.RATE_LIMIT_ANALYTICS ?? 'false',
  },
  vector: {
    store: process.env.VECTOR_STORE || 'qdrant',
    collectionName: 'layerum_chunks',
    qdrant: {
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY ?? '',
    },
    lancedb: {
      uri: process.env.LANCEDB_URI || './data/lancedb',
    },
    pgvector: {
      databaseUrl: process.env.DATABASE_URL ?? '',
    },
  },
  uploads: {
    maxFileBytes: process.env.MAX_UPLOAD_FILE_BYTES ?? '52428800',
  },
});
