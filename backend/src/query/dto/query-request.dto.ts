import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryRequestDto {
  @ApiProperty()
  @IsUUID()
  workspaceId: string;

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiProperty()
  @IsUUID()
  modelConfigId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeParentScopes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  debug?: boolean;
}
