import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class InitUploadDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  file_name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content_type?: string;

  @ApiPropertyOptional({ enum: ['self', 'self_and_descendants'] })
  @IsOptional()
  @IsIn(['self', 'self_and_descendants'])
  visibility?: 'self' | 'self_and_descendants';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  model_config_id?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  file_size_bytes: number;
}
