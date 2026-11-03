export const INGESTION_QUEUE_NAME = 'ingestion';
export const INGESTION_JOB_NAME = 'ingestion.process';
export const UPLOAD_CLEANUP_QUEUE_NAME = 'upload_cleanup';
export const UPLOAD_CLEANUP_JOB_NAME = 'upload.cleanup';
export const LOGS_RETENTION_JOB_NAME = 'logs.retention';

export type AsyncTaskMode = 'auto' | 'inline' | 'queue' | 'gateway';
