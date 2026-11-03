import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  system_health_in_app?: boolean;

  @IsOptional()
  @IsBoolean()
  system_health_email?: boolean;

  @IsOptional()
  @IsBoolean()
  api_usage_in_app?: boolean;

  @IsOptional()
  @IsBoolean()
  api_usage_email?: boolean;
}
