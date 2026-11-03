import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const WORKSPACE_PERMISSIONS = [
  'members.manage',
  'providers.manage',
  'models.manage',
  'data.manage',
  'query.run',
  'api_keys.manage',
  'audit.read',
] as const;

export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export class CreateWorkspaceRoleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ isArray: true, enum: WORKSPACE_PERMISSIONS })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(64)
  @IsIn(WORKSPACE_PERMISSIONS, { each: true })
  permissions: WorkspacePermission[];
}
