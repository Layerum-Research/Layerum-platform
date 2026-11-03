import { SetMetadata } from '@nestjs/common';

export const ALLOW_CLI_TOKEN_KEY = 'auth:allow-cli-token';

export const AllowCliToken = () => SetMetadata(ALLOW_CLI_TOKEN_KEY, true);
