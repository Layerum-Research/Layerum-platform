import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AsyncTasksService } from '../async-tasks/async-tasks.service';
import { InternalAuthGuard } from './internal-auth.guard';

@UseGuards(InternalAuthGuard)
@Controller('internal/jobs')
export class InternalJobsController {
  constructor(private readonly tasks: AsyncTasksService) {}

  @Post('ingestion')
  async enqueueIngestion(@Body() body: { dataSourceId?: string }) {
    const dataSourceId = (body?.dataSourceId ?? '').trim();
    if (!dataSourceId) {
      throw new BadRequestException('dataSourceId is required');
    }
    const queued = await this.tasks.enqueueIngestionLocal(dataSourceId);
    if (!queued) {
      throw new BadRequestException(
        'Local queue mode is not active on gateway. Set ASYNC_TASKS_MODE=queue and REDIS_URL.',
      );
    }
    return { queued: true, dataSourceId };
  }
}
