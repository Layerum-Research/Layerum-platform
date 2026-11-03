import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsUUID,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDataSourceDto {
  @ApiProperty({ enum: ['file', 'url', 'text', 'api'] })
  @IsString()
  @IsIn(['file', 'url', 'text', 'api'])
  source_type: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  display_name: string;

  @ApiPropertyOptional()
  @ValidateIf((dto: CreateDataSourceDto) => dto.source_type === 'url')
  @IsNotEmpty()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @IsString()
  source_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  raw_text?: string;

  @ApiPropertyOptional({ enum: ['self', 'self_and_descendants'] })
  @IsOptional()
  @IsIn(['self', 'self_and_descendants'])
  visibility?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  model_config_id?: string;
}
