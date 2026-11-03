import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

function trimToNull(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function trimToLower(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => trimToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(254)
  full_name?: string | null;

  @ApiPropertyOptional()
  @Transform(({ value }) => trimToLower(value))
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
