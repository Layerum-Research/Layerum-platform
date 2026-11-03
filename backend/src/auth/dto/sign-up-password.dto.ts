import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

function trimToLower(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

function trim(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim();
}

export class SignUpPasswordDto {
  @ApiProperty()
  @Transform(({ value }) => trimToLower(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  password!: string;

  @ApiProperty()
  @Transform(({ value }) => trim(value))
  @IsString()
  @MinLength(2)
  @MaxLength(254)
  fullName!: string;
}
