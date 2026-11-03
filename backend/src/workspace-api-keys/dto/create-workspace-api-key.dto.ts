import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceApiKeyDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ type: [String], default: ['query:read'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['query:read', 'data:ingest', 'audit:read', 'config:manage'], {
    each: true,
  })
  capabilities?: Array<
    'query:read' | 'data:ingest' | 'audit:read' | 'config:manage'
  >;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  allowed_entity_ids: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  allowed_model_config_ids: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  rpm_limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500000000)
  daily_token_limit?: number;

  @ApiPropertyOptional({ description: 'ISO timestamp' })
  @IsOptional()
  @IsString()
  expires_at?: string;
}
