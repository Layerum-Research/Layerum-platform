import { Equals, IsString, Length, Matches } from 'class-validator';

export class TokenDto {
  @Equals('authorization_code')
  grant_type!: 'authorization_code';

  @IsString()
  @Length(1, 256)
  code!: string;

  @Matches(/^[A-Za-z0-9._~-]{43,128}$/)
  code_verifier!: string;

  @IsString()
  @Length(1, 128)
  client_id!: string;

  @IsString()
  @Length(1, 2048)
  redirect_uri!: string;
}
