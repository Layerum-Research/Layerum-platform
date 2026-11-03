import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { RateLimitPolicy } from '../common/rate-limit/rate-limit.decorator';
import { OAuthService } from './oauth.service';
import { AuthorizeDto } from './dto/authorize.dto';
import { TokenDto } from './dto/token.dto';

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly service: OAuthService) {}

  @Post('authorize')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  authorize(@CurrentUser() user: AuthUser, @Body() dto: AuthorizeDto) {
    return this.service.authorize(user.id, dto);
  }

  @Post('token')
  @HttpCode(200)
  @RateLimitPolicy('oauth.token')
  token(
    @Body() dto: TokenDto,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.service.exchangeToken(dto, userAgent ?? null);
  }

  @Post('revoke')
  @HttpCode(200)
  @ApiBearerAuth()
  @AllowCliToken()
  @UseGuards(JwtAuthGuard)
  revoke(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const [, token] = authorization?.split(' ') ?? [];
    return this.service.revokeCurrentToken(user.id, token ?? null);
  }

  @Get('tokens')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listTokens(@CurrentUser() user: AuthUser) {
    return this.service.listTokens(user.id);
  }

  @Delete('tokens/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  revokeToken(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revokeToken(user.id, id);
  }
}
