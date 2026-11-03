import { Module } from '@nestjs/common';
import { ModelDefinitionsController } from './model-definitions.controller';
import { ModelDefinitionsService } from './model-definitions.service';

@Module({
  controllers: [ModelDefinitionsController],
  providers: [ModelDefinitionsService],
  exports: [ModelDefinitionsService],
})
export class ModelDefinitionsModule {}
