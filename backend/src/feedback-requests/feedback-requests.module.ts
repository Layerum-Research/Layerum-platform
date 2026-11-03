import { Module } from '@nestjs/common';
import { FeedbackRequestsController } from './feedback-requests.controller';
import { FeedbackRequestsService } from './feedback-requests.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [FeedbackRequestsController],
  providers: [FeedbackRequestsService],
})
export class FeedbackRequestsModule {}
