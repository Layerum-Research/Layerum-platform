import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsHexadecimal, IsString, Length, MaxLength } from 'class-validator';

function trimToLower(value: unknown) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

export class MfaRecoveryRequestDto {
  @ApiProperty()
  @Transform(({ value }) => trimToLower(value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class MfaRecoveryConfirmDto {
  @ApiProperty({ description: '64-char hex recovery token from the email link' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsHexadecimal()
  @Length(64, 64)
  token!: string;
}
