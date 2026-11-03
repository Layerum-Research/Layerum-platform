import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { PresignedUpload, StorageObjectHead } from './storage.types';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;
  private readonly presignS3: S3Client;
  private readonly bucket: string;
  private readonly presignTtlSeconds: number;
  private readonly sseMode: PutObjectCommandInput['ServerSideEncryption'] | null;
  private readonly sseKmsKeyId: string | null;

  constructor(private readonly config: ConfigService) {
    const bucket = this.config.get<string>('s3.bucket') ?? '';
    if (!bucket) throw new Error('S3_BUCKET is required');

    this.bucket = bucket;
    this.presignTtlSeconds = Math.max(
      60,
      Number(this.config.get<string>('s3.presignTtlSeconds') ?? '900'),
    );

    const region = this.config.get<string>('s3.region') ?? 'us-east-1';
    const endpoint = this.config.get<string>('s3.endpoint') ?? undefined;
    const forcePathStyle =
      (this.config.get<string>('s3.forcePathStyle') ?? 'false').toLowerCase() ===
      'true';

    this.s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle,
    });

    const publicEndpoint = this.config.get<string>('s3.publicEndpoint');
    this.presignS3 = publicEndpoint
      ? new S3Client({ region, endpoint: publicEndpoint, forcePathStyle })
      : this.s3;

    const configuredSseRaw =
      this.config.get<string>('s3.serverSideEncryption') ?? 'AES256';
    const configuredSse = configuredSseRaw.trim().toUpperCase();
    this.sseMode =
      configuredSse === 'AWS:KMS'
        ? 'aws:kms'
        : configuredSse === 'AES256'
          ? 'AES256'
          : null;
    this.sseKmsKeyId =
      this.config.get<string>('s3.sseKmsKeyId')?.trim() || null;
  }

  async uploadBuffer(input: {
    objectKey: string;
    buffer: Buffer;
    contentType: string;
  }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      Body: input.buffer,
      ContentType: input.contentType,
      ...(this.sseMode ? { ServerSideEncryption: this.sseMode } : {}),
      ...(this.sseMode === 'aws:kms' && this.sseKmsKeyId
        ? { SSEKMSKeyId: this.sseKmsKeyId }
        : {}),
    });

    await this.s3.send(command);
  }

  async downloadBuffer(objectKey: string) {
    const result = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    if (!result.Body) throw new Error('Failed to download object body');
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObjects(objectKeys: string[]) {
    const keys = [...new Set(objectKeys.filter((value) => Boolean(value?.trim())))];
    if (keys.length === 0) return;

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Quiet: true,
            Objects: batch.map((Key) => ({ Key })),
          },
        }),
      );
    }
  }

  async headObject(objectKey: string): Promise<StorageObjectHead | null> {
    try {
      const result = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentLength:
          typeof result.ContentLength === 'number' ? result.ContentLength : null,
        contentType: result.ContentType ?? null,
        eTag: result.ETag ?? null,
      };
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error && '$metadata' in error
          ? Number(
              (error as { $metadata?: { httpStatusCode?: number } }).$metadata
                ?.httpStatusCode ?? 0,
            )
          : 0;
      const errorName =
        typeof error === 'object' && error && 'name' in error
          ? String((error as { name?: string }).name ?? '').toLowerCase()
          : '';
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (
        statusCode === 404 ||
        errorName === 'notfound' ||
        message.includes('notfound') ||
        message.includes('not found')
      ) {
        return null;
      }
      throw error;
    }
  }

  async createPresignedUpload(input: {
    objectKey: string;
    contentType: string;
    fileSize: number;
  }): Promise<PresignedUpload> {
    const normalizedSize = Math.max(1, Math.trunc(input.fileSize));
    const fields: Record<string, string> = {
      key: input.objectKey,
      'Content-Type': input.contentType,
    };
    if (this.sseMode) {
      fields['x-amz-server-side-encryption'] = this.sseMode;
    }
    if (this.sseMode === 'aws:kms' && this.sseKmsKeyId) {
      fields['x-amz-server-side-encryption-aws-kms-key-id'] = this.sseKmsKeyId;
    }
    const conditions: unknown[] = [
      ['eq', '$key', input.objectKey],
      ['eq', '$Content-Type', input.contentType],
      ['content-length-range', normalizedSize, normalizedSize],
    ];
    if (this.sseMode) {
      conditions.push(['eq', '$x-amz-server-side-encryption', this.sseMode]);
    }
    if (this.sseMode === 'aws:kms' && this.sseKmsKeyId) {
      conditions.push([
        'eq',
        '$x-amz-server-side-encryption-aws-kms-key-id',
        this.sseKmsKeyId,
      ]);
    }

    const presigned = await createPresignedPost(this.presignS3, {
      Bucket: this.bucket,
      Key: input.objectKey,
      Expires: this.presignTtlSeconds,
      Fields: fields,
      Conditions: conditions as Parameters<typeof createPresignedPost>[1]['Conditions'],
    });

    return {
      objectKey: presigned.fields.key,
      uploadUrl: presigned.url,
      method: 'POST',
      fields: presigned.fields,
      expiresInSeconds: this.presignTtlSeconds,
    };
  }
}
