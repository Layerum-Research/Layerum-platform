import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private config: ConfigService) {
    const hexKey = this.config.get<string>('encryption.key') ?? '';
    const normalized = hexKey.trim();

    if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
      throw new Error(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      );
    }

    const parsed = Buffer.from(normalized, 'hex');
    if (parsed.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY must decode to exactly 32 bytes for aes-256-gcm',
      );
    }

    this.key = parsed;
  }

  encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  keyPreview(plaintext: string): string {
    return '....' + plaintext.slice(-4);
  }
}
