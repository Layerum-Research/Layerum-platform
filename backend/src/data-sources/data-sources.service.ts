import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateDataSourceDto } from './dto/create-data-source.dto';
import { InitUploadDto } from './dto/init-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { IngestionService } from './ingestion.service';
import { VectorService } from '../vector/vector.service';
import type { Express } from 'express';
import { AuditService } from '../audit/audit.service';
import { DataEncryptionService } from '../workspace-encryption/data-encryption.service';
import { StorageService } from '../storage/storage.service';
import type { StorageBackend } from '../storage/storage.types';
import { AsyncTasksService } from '../async-tasks/async-tasks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { crossedQuotaLevel } from '../notifications/domain/storage-quota';

type SafeSourceShape = {
  id: string;
  workspace_id: string;
  entity_id: string;
  source_type: string;
  display_name: string;
  status: string;
  visibility: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  entity?: unknown;
  ingestion_jobs?: unknown;
};

@Injectable()
export class DataSourcesService {
  private readonly logger = new Logger(DataSourcesService.name);
  private cleanupRunning = false;
  private readonly uploadSessionGraceSeconds: number;
  private readonly presignTtlSeconds: number;
  private readonly maxFileBytes: number;
  private static readonly SAFE_SOURCE_SELECT =
    'id, workspace_id, entity_id, source_type, display_name, status, visibility, mime_type, file_size, created_at, updated_at';

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly ingestion: IngestionService,
    private readonly vector: VectorService,
    private readonly audit: AuditService,
    private readonly encryption: DataEncryptionService,
    private readonly storage: StorageService,
    private readonly tasks: AsyncTasksService,
    private readonly notifications: NotificationsService,
  ) {
    const grace = Number(
      this.config.get<string>('s3.uploadSessionGraceSeconds') ?? '300',
    );
    this.uploadSessionGraceSeconds = Number.isFinite(grace)
      ? Math.max(60, Math.trunc(grace))
      : 300;
    const presignTtl = Number(
      this.config.get<string>('s3.presignTtlSeconds') ?? '900',
    );
    this.presignTtlSeconds = Number.isFinite(presignTtl)
      ? Math.max(60, Math.trunc(presignTtl))
      : 900;
    const configuredMax = Number(
      this.config.get<string>('uploads.maxFileBytes') ?? '52428800',
    );
    this.maxFileBytes = Number.isFinite(configuredMax)
      ? Math.max(1_048_576, Math.trunc(configuredMax))
      : 52_428_800;
  }

  async create(
    workspaceId: string,
    entityId: string,
    userId: string,
    dto: CreateDataSourceDto,
    storagePath?: string,
    mimeType?: string,
    fileSize?: number,
    checksum?: string,
    storageBackend?: StorageBackend,
  ) {
    await this.assertEntityInWorkspace(workspaceId, entityId);
    try {
      const metadata: Record<string, unknown> = {};
      if (dto.model_config_id) metadata.model_config_id = dto.model_config_id;

      const encryptedSourceUrl = dto.source_url
        ? await this.encryption.encryptValue(workspaceId, dto.source_url)
        : null;
      const encryptedRawText = dto.raw_text
        ? await this.encryption.encryptValue(workspaceId, dto.raw_text)
        : null;

      const { data, error } = await this.supabase.admin
        .from('data_sources')
        .insert({
          workspace_id: workspaceId,
          entity_id: entityId,
          source_type: dto.source_type,
          display_name: dto.display_name,
          source_url: null,
          source_url_ciphertext: encryptedSourceUrl?.ciphertext ?? null,
          source_url_iv: encryptedSourceUrl?.iv ?? null,
          source_url_tag: encryptedSourceUrl?.tag ?? null,
          raw_text_ciphertext: encryptedRawText?.ciphertext ?? null,
          raw_text_iv: encryptedRawText?.iv ?? null,
          raw_text_tag: encryptedRawText?.tag ?? null,
          sensitive_enc_version:
            encryptedSourceUrl?.encVersion ??
            encryptedRawText?.encVersion ??
            null,
          storage_path: storagePath ?? null,
          storage_backend:
            storageBackend ?? (dto.source_type === 'file' ? 's3' : 'none'),
          mime_type: mimeType ?? null,
          file_size: fileSize ?? null,
          checksum: checksum ?? null,
          visibility: dto.visibility ?? 'self_and_descendants',
          metadata,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (['url', 'text', 'file'].includes(dto.source_type)) {
        await this.startIngestion(data.id);
      }
      await this.safeAudit({
        workspaceId,
        userId,
        action: dto.source_type === 'file' ? 'upload' : 'create',
        resource: 'data_source',
        resourceId: data.id,
        metadata: { sourceType: dto.source_type, entityId },
      });
      return this.toSafeSource(data);
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: dto.source_type === 'file' ? 'upload' : 'create',
        resource: 'data_source',
        success: false,
        errorCode: this.errorCode(error),
        metadata: { sourceType: dto.source_type, entityId },
      });
      throw error;
    }
  }

  async uploadAndCreate(
    workspaceId: string,
    entityId: string,
    userId: string,
    file: Express.Multer.File,
    visibility: 'self' | 'self_and_descendants' = 'self_and_descendants',
    modelConfigId?: string,
  ) {
    await this.assertEntityInWorkspace(workspaceId, entityId);
    if (!file) throw new BadRequestException('File is required');
    const fileSize = Math.max(1, Math.trunc(file.size ?? 0));
    this.assertMaxFileSize(fileSize);
    const safeFileName = this.normalizeFileName(
      file.originalname || 'uploaded_file.bin',
    );
    const objectKey = this.ingestion.buildStoragePath(
      workspaceId,
      entityId,
      safeFileName,
    );
    const reserved = await this.reserveUploadSession({
      workspaceId,
      entityId,
      userId,
      objectKey,
      fileSize,
      expiresAt: this.computeUploadSessionExpiry(),
    });

    let created: Awaited<ReturnType<DataSourcesService['create']>>;
    try {
      await this.storage.uploadBuffer({
        objectKey,
        buffer: file.buffer,
        contentType: file.mimetype || 'application/octet-stream',
      });
      created = await this.create(
        workspaceId,
        entityId,
        userId,
        {
          source_type: 'file',
          display_name: file.originalname,
          visibility,
          model_config_id: modelConfigId,
        },
        objectKey,
        file.mimetype || 'application/octet-stream',
        fileSize,
        createHash('sha256').update(file.buffer).digest('hex'),
        's3',
      );
    } catch (error) {
      await this.safeDeleteS3Object(objectKey, 'direct upload cleanup failed');
      await this.abortUploadSession(reserved.uploadId, this.errorCode(error));
      throw error;
    }

    try {
      await this.finalizeUploadSession({
        uploadId: reserved.uploadId,
        workspaceId,
        entityId,
        dataSourceId: created.id,
        actualSizeBytes: fileSize,
      });
    } catch (error) {
      await this.abortUploadSession(reserved.uploadId, this.errorCode(error));
      this.logger.warn(
        `Upload session finalize failed after source creation ${created.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.toSafeSource(created);
  }

  async initUpload(
    workspaceId: string,
    entityId: string,
    userId: string,
    dto: InitUploadDto,
  ) {
    await this.assertEntityInWorkspace(workspaceId, entityId);
    const fileSize = Math.max(1, Math.trunc(dto.file_size_bytes ?? 0));
    this.assertMaxFileSize(fileSize);
    const safeFileName = this.normalizeFileName(dto.file_name);
    const objectKey = this.ingestion.buildStoragePath(
      workspaceId,
      entityId,
      safeFileName,
    );
    const reserved = await this.reserveUploadSession({
      workspaceId,
      entityId,
      userId,
      objectKey,
      fileSize,
      expiresAt: this.computeUploadSessionExpiry(),
    });

    let presigned: Awaited<ReturnType<StorageService['createPresignedUpload']>>;
    try {
      presigned = await this.storage.createPresignedUpload({
        objectKey,
        contentType: dto.content_type ?? 'application/octet-stream',
        fileSize,
      });
    } catch (error) {
      await this.abortUploadSession(reserved.uploadId, this.errorCode(error));
      throw error;
    }

    return {
      uploadId: reserved.uploadId,
      objectKey: presigned.objectKey,
      uploadUrl: presigned.uploadUrl,
      method: presigned.method,
      fields: presigned.fields,
      expiresInSeconds: presigned.expiresInSeconds,
      visibility: dto.visibility ?? 'self_and_descendants',
      modelConfigId: dto.model_config_id ?? null,
    };
  }

  async completeUpload(
    workspaceId: string,
    entityId: string,
    userId: string,
    dto: CompleteUploadDto,
  ) {
    await this.assertEntityInWorkspace(workspaceId, entityId);
    const session = await this.loadUploadSession(
      dto.upload_id,
      workspaceId,
      entityId,
    );
    const head = await this.storage.headObject(session.object_key);
    if (!head || (head.contentLength ?? 0) <= 0) {
      throw new BadRequestException(
        'Uploaded object is missing in S3 or has empty content',
      );
    }
    const fileSize = Math.max(0, Math.trunc(head.contentLength ?? 0));
    this.assertMaxFileSize(fileSize);
    if (fileSize !== session.declared_size_bytes) {
      await this.safeDeleteS3Object(
        session.object_key,
        'upload size mismatch cleanup failed',
      );
      await this.abortUploadSession(session.id, 'UPLOAD_SIZE_MISMATCH');
      throw new BadRequestException(
        `Uploaded object size mismatch: expected ${session.declared_size_bytes}, got ${fileSize}`,
      );
    }

    let created: Awaited<ReturnType<DataSourcesService['create']>>;
    try {
      created = await this.create(
        workspaceId,
        entityId,
        userId,
        {
          source_type: 'file',
          display_name:
            dto.display_name ??
            this.inferDisplayNameFromKey(session.object_key),
          visibility: dto.visibility ?? 'self_and_descendants',
          model_config_id: dto.model_config_id,
        },
        session.object_key,
        head.contentType ?? 'application/octet-stream',
        fileSize,
        dto.checksum,
        's3',
      );
    } catch (error) {
      await this.safeDeleteS3Object(
        session.object_key,
        'upload finalize cleanup failed',
      );
      await this.abortUploadSession(session.id, this.errorCode(error));
      throw error;
    }

    try {
      await this.finalizeUploadSession({
        uploadId: session.id,
        workspaceId,
        entityId,
        dataSourceId: created.id,
        actualSizeBytes: fileSize,
      });
    } catch (error) {
      await this.abortUploadSession(session.id, this.errorCode(error));
      this.logger.warn(
        `Upload session finalize failed after source creation ${created.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.toSafeSource(created);
  }

  async findAll(workspaceId: string, entityId?: string) {
    let query = this.supabase.admin
      .from('data_sources')
      .select(
        `${DataSourcesService.SAFE_SOURCE_SELECT}, entity:entities(id, name), ingestion_jobs(id, status, steps_completed, error_message, updated_at, created_at, metadata)`,
      )
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (entityId) query = query.eq('entity_id', entityId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => this.toSafeSource(row));
  }

  async findOne(workspaceId: string, entityId: string, id: string) {
    const { data, error } = await this.supabase.admin
      .from('data_sources')
      .select(
        `${DataSourcesService.SAFE_SOURCE_SELECT}, entity:entities(id, name), ingestion_jobs(id, status, steps_completed, error_message, updated_at, created_at, metadata)`,
      )
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .single();

    if (error || !data) throw new NotFoundException('Data source not found');
    return this.toSafeSource(data);
  }

  async getLatestError(
    workspaceId: string,
    entityId: string,
    dataSourceId: string,
  ) {
    const { data: source, error } = await this.supabase.admin
      .from('data_sources')
      .select('id, workspace_id, entity_id, status')
      .eq('id', dataSourceId)
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .single();

    if (error || !source) throw new NotFoundException('Data source not found');

    const { data: latestJob, error: latestJobError } = await this.supabase.admin
      .from('ingestion_jobs')
      .select(
        'id, status, error_message, steps_completed, updated_at, created_at, metadata',
      )
      .eq('data_source_id', dataSourceId)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestJobError) throw new Error(latestJobError.message);
    if (!latestJob) {
      throw new NotFoundException('No ingestion job found for this source');
    }

    return {
      sourceId: dataSourceId,
      status: source.status,
      latestJob,
    };
  }

  async updateStatus(id: string, status: string) {
    await this.supabase.admin
      .from('data_sources')
      .update({ status })
      .eq('id', id);
  }

  async remove(
    workspaceId: string,
    entityId: string,
    id: string,
    userId: string,
  ) {
    let currentStep = 'started';
    try {
      this.logger.log(
        JSON.stringify({
          event: 'source_delete_started',
          workspaceId,
          entityId,
          sourceId: id,
        }),
      );

      currentStep = 'load_source';
      const { data: source, error } = await this.supabase.admin
        .from('data_sources')
        .select('id, workspace_id, entity_id, storage_path, storage_backend')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .eq('entity_id', entityId)
        .single();

      if (error || !source)
        throw new NotFoundException('Data source not found');

      currentStep = 'load_documents';
      const { data: docs, error: docsError } = await this.supabase.admin
        .from('documents')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('entity_id', entityId)
        .eq('data_source_id', id);

      if (docsError) throw new Error(docsError.message);

      currentStep = 'delete_vectors';
      const documentIds = (docs ?? []).map((doc) => doc.id);
      if (documentIds.length > 0) {
        const { data: vectorRecords, error: vectorRecordsError } =
          await this.supabase.admin
            .from('vector_records')
            .select('collection_name, vector_point_id')
            .eq('workspace_id', workspaceId)
            .eq('entity_id', entityId)
            .in('document_id', documentIds);

        if (vectorRecordsError) throw new Error(vectorRecordsError.message);

        const pointsByCollection = new Map<string, string[]>();
        for (const record of vectorRecords ?? []) {
          if (!record.collection_name || !record.vector_point_id) continue;
          if (!pointsByCollection.has(record.collection_name)) {
            pointsByCollection.set(record.collection_name, []);
          }
          pointsByCollection
            .get(record.collection_name)!
            .push(record.vector_point_id);
        }

        for (const [collectionName, pointIds] of pointsByCollection) {
          await this.vector.deletePoints(collectionName, pointIds);
        }

        if ((vectorRecords ?? []).length === 0) {
          // Fallback for legacy rows where vector_records may be missing.
          for (const docId of documentIds) {
            await this.vector.deleteByPayload(workspaceId, docId);
          }
        }

        this.logger.log(
          JSON.stringify({
            event: 'source_delete_vector_records_done',
            workspaceId,
            entityId,
            sourceId: id,
            vectorRecordCount: vectorRecords?.length ?? 0,
            collectionCount: pointsByCollection.size,
          }),
        );
      }

      this.logger.log(
        JSON.stringify({
          event: 'source_delete_vectors_done',
          workspaceId,
          entityId,
          sourceId: id,
          documentCount: docs?.length ?? 0,
        }),
      );

      if (source.storage_path && source.storage_backend === 's3') {
        currentStep = 'delete_storage';
        await this.storage.deleteObjects([source.storage_path]);

        this.logger.log(
          JSON.stringify({
            event: 'source_delete_storage_done',
            workspaceId,
            entityId,
            sourceId: id,
            storagePath: source.storage_path,
          }),
        );
      }

      currentStep = 'delete_source_row';
      await this.supabase.admin
        .from('data_sources')
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .eq('entity_id', entityId);

      this.logger.log(
        JSON.stringify({
          event: 'source_delete_completed',
          workspaceId,
          entityId,
          sourceId: id,
        }),
      );

      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'data_source',
        resourceId: id,
        metadata: { entityId },
      });
      return { success: true };
    } catch (error) {
      await this.safeAudit({
        workspaceId,
        userId,
        action: 'delete',
        resource: 'data_source',
        resourceId: id,
        success: false,
        errorCode: this.errorCode(error),
        metadata: { entityId, failed_step: currentStep },
      });
      const message =
        error instanceof Error ? error.message : 'Source delete failed';
      this.logger.error(
        JSON.stringify({
          event: 'source_delete_failed',
          workspaceId,
          entityId,
          sourceId: id,
          failed_step: currentStep,
          error: message,
        }),
      );
      throw error;
    }
  }

  async retryIngestion(
    workspaceId: string,
    entityId: string,
    dataSourceId: string,
    userId: string,
  ) {
    const { data: source, error } = await this.supabase.admin
      .from('data_sources')
      .select(
        'id, workspace_id, entity_id, status, source_type, storage_backend',
      )
      .eq('id', dataSourceId)
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .single();

    if (error || !source) throw new NotFoundException('Data source not found');
    if (source.status !== 'failed') {
      throw new BadRequestException(
        'Retry is available only for failed sources',
      );
    }
    if (
      source.source_type === 'file' &&
      source.storage_backend === 'supabase_legacy'
    ) {
      throw new BadRequestException(
        'Legacy file source is frozen after storage migration and cannot be retried',
      );
    }

    await this.supabase.admin
      .from('documents')
      .delete()
      .eq('data_source_id', dataSourceId)
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId);

    await this.supabase.admin
      .from('ingestion_jobs')
      .delete()
      .eq('data_source_id', dataSourceId)
      .eq('workspace_id', workspaceId);

    await this.supabase.admin
      .from('data_sources')
      .update({ status: 'pending' })
      .eq('id', dataSourceId)
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId);

    await this.startIngestion(dataSourceId);

    await this.safeAudit({
      workspaceId,
      userId,
      action: 'update',
      resource: 'data_source_retry',
      resourceId: dataSourceId,
      metadata: { entityId },
    });

    return { success: true, queued: true, dataSourceId };
  }

  private computeUploadSessionExpiry() {
    const now = Date.now();
    const ttlMs =
      (this.presignTtlSeconds + this.uploadSessionGraceSeconds) * 1000;
    return new Date(now + ttlMs).toISOString();
  }

  private async reserveUploadSession(input: {
    workspaceId: string;
    entityId: string;
    userId: string;
    objectKey: string;
    fileSize: number;
    expiresAt: string;
  }) {
    const { data, error } = await this.supabase.admin.rpc(
      'reserve_upload_session',
      {
        p_workspace_id: input.workspaceId,
        p_entity_id: input.entityId,
        p_created_by: input.userId,
        p_object_key: input.objectKey,
        p_declared_size_bytes: input.fileSize,
        p_expires_at: input.expiresAt,
      },
    );
    if (error) {
      if (error.message.includes('STORAGE_CAPACITY_EXCEEDED')) {
        await this.notifications.notify({
          type: 'storage_quota_reached',
          workspaceId: input.workspaceId,
          ownerUserId: null,
          usedBytes: null,
          capacityBytes: null,
        });
        throw new BadRequestException(
          'Storage capacity exceeded for workspace owner plan',
        );
      }
      throw new Error(error.message);
    }

    const row = data?.[0];
    if (!row?.upload_id) {
      throw new Error('Failed to reserve upload session');
    }
    await this.notifyQuotaCrossing(input.workspaceId, row);
    return { uploadId: row.upload_id };
  }

  private async notifyQuotaCrossing(
    workspaceId: string,
    reservation: {
      owner_user_id: string;
      used_bytes: number;
      projected_used_bytes: number;
      capacity_bytes: number;
    },
  ) {
    const level = crossedQuotaLevel(
      reservation.used_bytes,
      reservation.projected_used_bytes,
      reservation.capacity_bytes,
    );
    if (!level) return;

    await this.notifications.notify({
      type: `storage_quota_${level}`,
      workspaceId,
      ownerUserId: reservation.owner_user_id,
      usedBytes: reservation.projected_used_bytes,
      capacityBytes: reservation.capacity_bytes,
    });
  }

  private async loadUploadSession(
    uploadId: string,
    workspaceId: string,
    entityId: string,
  ) {
    const { data, error } = await this.supabase.admin
      .from('upload_sessions')
      .select(
        'id, workspace_id, entity_id, object_key, declared_size_bytes, status, expires_at',
      )
      .eq('id', uploadId)
      .eq('workspace_id', workspaceId)
      .eq('entity_id', entityId)
      .maybeSingle<{
        id: string;
        workspace_id: string;
        entity_id: string;
        object_key: string;
        declared_size_bytes: number | string;
        status: string;
        expires_at: string;
      }>();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Upload session not found');
    if (data.status !== 'pending') {
      throw new BadRequestException(
        `Upload session is not pending: ${data.status}`,
      );
    }
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('Upload session has expired');
    }
    const declared = Number(data.declared_size_bytes);
    if (!Number.isFinite(declared) || declared <= 0) {
      throw new BadRequestException('Upload session has invalid declared size');
    }
    return {
      id: data.id,
      object_key: data.object_key,
      declared_size_bytes: Math.trunc(declared),
    };
  }

  private async finalizeUploadSession(input: {
    uploadId: string;
    workspaceId: string;
    entityId: string;
    dataSourceId: string;
    actualSizeBytes: number;
  }) {
    const { error } = await this.supabase.admin.rpc('finalize_upload_session', {
      p_upload_id: input.uploadId,
      p_workspace_id: input.workspaceId,
      p_entity_id: input.entityId,
      p_data_source_id: input.dataSourceId,
      p_actual_size_bytes: input.actualSizeBytes,
    });
    if (error) throw new Error(error.message);
  }

  private async abortUploadSession(uploadId: string, reason?: string) {
    const { error } = await this.supabase.admin.rpc('abort_upload_session', {
      p_upload_id: uploadId,
      p_error: reason ?? null,
    });
    if (error) {
      this.logger.warn(
        `Failed to abort upload session ${uploadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async processExpiredUploadSessions() {
    if (this.cleanupRunning) return;
    this.cleanupRunning = true;
    try {
      const { data, error } = await this.supabase.admin.rpc(
        'claim_upload_sessions_for_cleanup',
        {
          p_limit: 50,
        },
      );
      if (error) throw new Error(error.message);

      const sessions = (data ?? []) as Array<{
        upload_id: string;
        object_key: string;
      }>;
      for (const session of sessions) {
        try {
          await this.storage.deleteObjects([session.object_key]);
          await this.supabase.admin.rpc('mark_upload_session_cleanup_result', {
            p_upload_id: session.upload_id,
            p_success: true,
            p_error: null,
          });
        } catch (cleanupError) {
          const message =
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError);
          await this.supabase.admin.rpc('mark_upload_session_cleanup_result', {
            p_upload_id: session.upload_id,
            p_success: false,
            p_error: message,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        `Upload session cleanup pass failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.cleanupRunning = false;
    }
  }

  private async safeDeleteS3Object(objectKey: string, logPrefix: string) {
    try {
      await this.storage.deleteObjects([objectKey]);
    } catch (cleanupError) {
      this.logger.warn(
        `${logPrefix} (${objectKey}): ${
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError)
        }`,
      );
    }
  }

  private async startIngestion(dataSourceId: string) {
    const queued = await this.tasks.dispatchIngestion(dataSourceId);
    if (queued) return;
    setTimeout(() => {
      void this.ingestion.ingestDataSource(dataSourceId);
    }, 0);
  }

  private errorCode(error: unknown) {
    if (error instanceof Error && error.name) return error.name;
    return 'UnknownError';
  }

  private async safeAudit(input: Parameters<AuditService['logAction']>[0]) {
    try {
      await this.audit.logAction(input);
    } catch {}
  }

  private normalizeFileName(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return 'file.bin';
    return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private inferDisplayNameFromKey(objectKey: string) {
    const candidate = objectKey.split('/').pop() ?? 'uploaded_file';
    return candidate.replace(/^\d+-/, '') || candidate;
  }

  private assertMaxFileSize(fileSize: number) {
    if (fileSize > this.maxFileBytes) {
      throw new BadRequestException(
        `File is too large. Maximum allowed size is ${this.maxFileBytes} bytes`,
      );
    }
  }

  private async assertEntityInWorkspace(workspaceId: string, entityId: string) {
    const { data, error } = await this.supabase.admin
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Entity not found');
  }

  private toSafeSource<T extends Record<string, unknown>>(
    row: T,
  ): SafeSourceShape {
    return {
      id: String(row.id ?? ''),
      workspace_id: String(row.workspace_id ?? ''),
      entity_id: String(row.entity_id ?? ''),
      source_type: String(row.source_type ?? ''),
      display_name: String(row.display_name ?? ''),
      status: String(row.status ?? ''),
      visibility: String(row.visibility ?? ''),
      mime_type:
        typeof row.mime_type === 'string' || row.mime_type === null
          ? row.mime_type
          : null,
      file_size:
        typeof row.file_size === 'number'
          ? row.file_size
          : row.file_size === null
            ? null
            : null,
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
      ...(row.entity ? { entity: row.entity } : {}),
      ...(row.ingestion_jobs ? { ingestion_jobs: row.ingestion_jobs } : {}),
    };
  }
}
