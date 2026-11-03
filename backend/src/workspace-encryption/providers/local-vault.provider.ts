import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { KeyProvider } from './key-provider.interface';
import type { WrappedDek } from '../types';

@Injectable()
export class LocalVaultProvider implements KeyProvider {
  readonly kind: WrappedDek['provider'] = 'local_vault';
  private readonly masterKey: Buffer;

  constructor(private readonly config: ConfigService) {
    const raw =
      this.config.get<string>('workspaceEncryption.localMasterKey') ??
      this.config.get<string>('encryption.key') ??
      '';

    const normalized = raw.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
      throw new Error(
        'WORKSPACE_ENCRYPTION_LOCAL_MASTER_KEY must be a 64-character hex string',
      );
    }

    const parsed = Buffer.from(normalized, 'hex');
    if (parsed.length !== 32) {
      throw new Error(
        'WORKSPACE_ENCRYPTION_LOCAL_MASTER_KEY must decode to 32 bytes',
      );
    }

    this.masterKey = parsed;
  }

  async generateWrappedDek(_workspaceId: string) {
    const plaintextDek = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintextDek), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      plaintextDek,
      wrapped: {
        provider: this.kind,
        encryptedDek: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        kmsKeyId: null,
      },
    };
  }

  async unwrapDek(input: WrappedDek): Promise<Buffer> {
    if (input.provider !== this.kind) {
      throw new Error(`Cannot unwrap provider ${input.provider} with ${this.kind}`);
    }
    if (!input.iv || !input.tag) {
      throw new Error('Wrapped local_vault key is missing iv/tag');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(input.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(input.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(input.encryptedDek, 'base64')),
      decipher.final(),
    ]);

    if (plaintext.length !== 32) {
      throw new Error('Invalid DEK size after unwrap');
    }

    return plaintext;
  }
}
