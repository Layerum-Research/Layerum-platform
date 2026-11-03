import { Global, Module } from '@nestjs/common';
import { KeyManagementService } from './key-management.service';
import { DataEncryptionService } from './data-encryption.service';
import { AwsKmsProvider } from './providers/aws-kms.provider';
import { LocalVaultProvider } from './providers/local-vault.provider';

@Global()
@Module({
  providers: [
    AwsKmsProvider,
    LocalVaultProvider,
    KeyManagementService,
    DataEncryptionService,
  ],
  exports: [KeyManagementService, DataEncryptionService],
})
export class WorkspaceEncryptionModule {}
