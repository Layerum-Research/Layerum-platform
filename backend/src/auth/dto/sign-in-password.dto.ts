import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

function trimToLower(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export class SignInPasswordDto {
  @ApiProperty()
  @Transform(({ value }) => trimToLower(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  password!: string;
}
