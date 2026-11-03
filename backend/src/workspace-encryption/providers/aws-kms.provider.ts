import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeyProvider } from './key-provider.interface';
import type { WrappedDek } from '../types';

@Injectable()
export class AwsKmsProvider implements KeyProvider {
  readonly kind: WrappedDek['provider'] = 'aws_kms';
  private readonly keyId: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.keyId = this.config.get<string>('workspaceEncryption.awsKmsKeyId') ?? '';
    this.region = this.config.get<string>('workspaceEncryption.awsRegion') ?? 'us-east-1';
  }

  private async loadSdk() {
    try {
      const moduleName = '@aws-sdk/client-kms';
      return (await import(moduleName)) as any;
    } catch {
      throw new Error(
        'AWS KMS provider requires @aws-sdk/client-kms dependency at runtime',
      );
    }
  }

  async generateWrappedDek(workspaceId: string) {
    if (!this.keyId) {
      throw new Error('WORKSPACE_ENCRYPTION_AWS_KMS_KEY_ID is required');
    }

    const sdk = await this.loadSdk();
    const client = new sdk.KMSClient({ region: this.region });
    const command = new sdk.GenerateDataKeyCommand({
      KeyId: this.keyId,
      KeySpec: 'AES_256',
      EncryptionContext: { workspace_id: workspaceId },
    });

    const output = await client.send(command);
    const plaintext = output.Plaintext ? Buffer.from(output.Plaintext as Uint8Array) : null;
    const ciphertext = output.CiphertextBlob
      ? Buffer.from(output.CiphertextBlob as Uint8Array)
      : null;

    if (!plaintext || !ciphertext) {
      throw new Error('AWS KMS did not return data key material');
    }

    return {
      plaintextDek: plaintext,
      wrapped: {
        provider: this.kind,
        encryptedDek: ciphertext.toString('base64'),
        iv: null,
        tag: null,
        kmsKeyId: this.keyId,
      },
    };
  }

  async unwrapDek(input: WrappedDek): Promise<Buffer> {
    if (input.provider !== this.kind) {
      throw new Error(`Cannot unwrap provider ${input.provider} with ${this.kind}`);
    }
    const keyId = input.kmsKeyId ?? this.keyId;
    if (!keyId) {
      throw new Error('Missing KMS key id for unwrap');
    }

    const sdk = await this.loadSdk();
    const client = new sdk.KMSClient({ region: this.region });
    const command = new sdk.DecryptCommand({
      CiphertextBlob: Buffer.from(input.encryptedDek, 'base64'),
      KeyId: keyId,
    });

    const output = await client.send(command);
    const plaintext = output.Plaintext ? Buffer.from(output.Plaintext as Uint8Array) : null;

    if (!plaintext || plaintext.length !== 32) {
      throw new Error('AWS KMS returned invalid plaintext DEK');
    }

    return plaintext;
  }
}
