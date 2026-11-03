import { Equals, IsString, Length, Matches } from 'class-validator';

export class AuthorizeDto {
  @IsString()
  @Length(1, 128)
  client_id!: string;

  @IsString()
  @Length(1, 2048)
  redirect_uri!: string;

  @Matches(/^[A-Za-z0-9_-]{43}$/)
  code_challenge!: string;

  @Equals('S256')
  code_challenge_method!: 'S256';

  @IsString()
  @Length(8, 512)
  state!: string;
}
