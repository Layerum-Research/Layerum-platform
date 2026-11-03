import { Module } from '@nestjs/common';
import { InternalJobsController } from './internal-jobs.controller';
import { InternalVectorController } from './internal-vector.controller';
import { InternalAuthGuard } from './internal-auth.guard';

@Module({
  controllers: [InternalJobsController, InternalVectorController],
  providers: [InternalAuthGuard],
})
export class InternalModule {}
