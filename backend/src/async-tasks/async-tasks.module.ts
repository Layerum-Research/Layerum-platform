import { Global, Module } from '@nestjs/common';
import { AsyncTasksService } from './async-tasks.service';

@Global()
@Module({
  providers: [AsyncTasksService],
  exports: [AsyncTasksService],
})
export class AsyncTasksModule {}
