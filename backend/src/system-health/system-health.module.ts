import { Global, Module } from '@nestjs/common';
import { SystemHealthService } from './system-health.service';
import { HealthMonitorService } from './health-monitor.service';

@Global()
@Module({
  providers: [SystemHealthService, HealthMonitorService],
  exports: [SystemHealthService, HealthMonitorService],
})
export class SystemHealthModule {}
