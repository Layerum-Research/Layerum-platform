import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

function trimToLower(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(({ value }) => trimToLower(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
