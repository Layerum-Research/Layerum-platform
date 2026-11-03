import { Global, Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Global()
@Module({
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
