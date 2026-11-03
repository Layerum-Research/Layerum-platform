import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { KeyManagementService } from './key-management.service';
import type { WorkspaceDek } from './types';

export type EncryptedChunkPayload = {
  is_encrypted: boolean;
  content: string;
  content_ciphertext: string | null;
  content_iv: string | null;
  content_tag: string | null;
  enc_version: number | null;
};

export type DocumentChunkRow = {
  id: string;
  chunk_index: number;
  content: string;
  content_ciphertext?: string | null;
  content_iv?: string | null;
  content_tag?: string | null;
  enc_version?: number | null;
  is_encrypted?: boolean | null;
  document_id: string;
  metadata?: Record<string, unknown> | null;
};

export type EncryptedValuePayload = {
  ciphertext: string;
  iv: string;
  tag: string;
  encVersion: number;
};

@Injectable()
export class DataEncryptionService {
  constructor(private readonly keys: KeyManagementService) {}

  async encryptChunk(workspaceId: string, plaintext: string): Promise<EncryptedChunkPayload> {
    const dek = await this.keys.getWorkspaceDek(workspaceId);
    return this.encryptWithDek(dek, plaintext);
  }

  async encryptValue(
    workspaceId: string,
    plaintext: string,
  ): Promise<EncryptedValuePayload> {
    const dek = await this.keys.getWorkspaceDek(workspaceId);
    const encrypted = this.encryptWithDek(dek, plaintext);
    if (!encrypted.content_ciphertext || !encrypted.content_iv || !encrypted.content_tag || !encrypted.enc_version) {
      throw new Error('Failed to encrypt value');
    }
    return {
      ciphertext: encrypted.content_ciphertext,
      iv: encrypted.content_iv,
      tag: encrypted.content_tag,
      encVersion: encrypted.enc_version,
    };
  }

  async encryptChunks(
    workspaceId: string,
    plaintexts: string[],
  ): Promise<EncryptedChunkPayload[]> {
    const dek = await this.keys.getWorkspaceDek(workspaceId);
    return plaintexts.map((plaintext) => this.encryptWithDek(dek, plaintext));
  }

  private encryptWithDek(
    dek: WorkspaceDek,
    plaintext: string,
  ): EncryptedChunkPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      is_encrypted: true,
      content: '[encrypted]',
      content_ciphertext: encrypted.toString('base64'),
      content_iv: iv.toString('base64'),
      content_tag: tag.toString('base64'),
      enc_version: dek.version,
    };
  }

  async resolveChunkContent(workspaceId: string, row: DocumentChunkRow): Promise<string> {
    if (!row.is_encrypted) return row.content;
    if (!row.content_ciphertext || !row.content_iv || !row.content_tag || !row.enc_version) {
      throw new Error('Encrypted chunk is missing encryption metadata');
    }

    const dek = await this.keys.getWorkspaceDek(workspaceId, row.enc_version);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dek.key,
      Buffer.from(row.content_iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(row.content_tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.content_ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  async decryptValue(
    workspaceId: string,
    payload: {
      ciphertext: string;
      iv: string;
      tag: string;
      encVersion: number;
    },
  ): Promise<string> {
    const dek = await this.keys.getWorkspaceDek(workspaceId, payload.encVersion);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dek.key,
      Buffer.from(payload.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
