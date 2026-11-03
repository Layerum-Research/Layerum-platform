import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  @MaxLength(60)
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo_url?: string;
}
