import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WORKSPACE_PERMISSIONS, type WorkspacePermission } from './create-workspace-role.dto';

export class UpdateWorkspaceRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ isArray: true, enum: WORKSPACE_PERMISSIONS })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(64)
  @IsIn(WORKSPACE_PERMISSIONS, { each: true })
  permissions?: WorkspacePermission[];
}
