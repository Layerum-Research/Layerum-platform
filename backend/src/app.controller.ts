import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SubscriptionsService } from './subscriptions/subscriptions.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('pricing/plans')
  listPricingPlans() {
    return this.subscriptionsService.listPlans();
  }
}
