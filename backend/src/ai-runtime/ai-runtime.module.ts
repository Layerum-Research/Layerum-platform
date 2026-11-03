import { Module } from '@nestjs/common';
import { ProviderRuntimeService } from './provider-runtime.service';

@Module({
  providers: [ProviderRuntimeService],
  exports: [ProviderRuntimeService],
})
export class AiRuntimeModule {}
