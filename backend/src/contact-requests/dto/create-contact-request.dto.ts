import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateContactRequestDto {
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
}
