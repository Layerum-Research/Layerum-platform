import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CompleteUploadDto {
  @ApiProperty()
  @IsUUID()
  upload_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  display_name?: string;

  @ApiPropertyOptional({ enum: ['self', 'self_and_descendants'] })
  @IsOptional()
  @IsIn(['self', 'self_and_descendants'])
  visibility?: 'self' | 'self_and_descendants';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  model_config_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  checksum?: string;
}
