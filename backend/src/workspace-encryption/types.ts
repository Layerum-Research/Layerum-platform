export type KeyProviderKind = 'aws_kms' | 'local_vault';

export type WrappedDek = {
  provider: KeyProviderKind;
  encryptedDek: string;
  iv: string | null;
  tag: string | null;
  kmsKeyId: string | null;
};

export type WorkspaceDek = {
  workspaceId: string;
  version: number;
  key: Buffer;
};
