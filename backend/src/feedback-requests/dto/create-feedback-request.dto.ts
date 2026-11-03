import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateFeedbackRequestDto {
  @ApiProperty()
  @Transform(({ value }) => trimIfString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @Transform(({ value }) => trimIfString(value))
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @Transform(({ value }) => trimIfString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  categories?: string[];

  @ApiPropertyOptional()
  @Transform(({ value }) => trimIfString(value))
  @IsOptional()
  @IsString()
  @MaxLength(160)
  context?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => trimIfString(value))
  @IsOptional()
  @IsString()
  @MaxLength(256)
  page?: string;
}
