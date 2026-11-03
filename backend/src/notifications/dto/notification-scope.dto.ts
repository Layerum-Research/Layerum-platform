import { IsOptional, IsUUID } from 'class-validator';

export class NotificationScopeDto {
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}
