import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowCliToken } from '../common/decorators/allow-cli-token.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SignInPasswordDto } from './dto/sign-in-password.dto';
import { SignUpPasswordDto } from './dto/sign-up-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  MfaRecoveryConfirmDto,
  MfaRecoveryRequestDto,
} from './dto/mfa-recovery.dto';
import { RateLimitPolicy } from '../common/rate-limit/rate-limit.decorator';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signin')
  signInWithPassword(@Body() dto: SignInPasswordDto) {
    return this.authService.signInWithPassword(dto);
  }

  @Post('signup')
  signUpWithPassword(@Body() dto: SignUpPasswordDto) {
    return this.authService.signUpWithPassword(dto);
  }

  @Post('forgot-password')
  @RateLimitPolicy('auth.password.reset')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('mfa/recovery/request')
  @RateLimitPolicy('auth.mfa.recovery')
  requestMfaRecovery(@Body() dto: MfaRecoveryRequestDto) {
    return this.authService.requestMfaRecovery(dto);
  }

  @Post('mfa/recovery/confirm')
  @RateLimitPolicy('auth.mfa.recovery')
  confirmMfaRecovery(@Body() dto: MfaRecoveryConfirmDto) {
    return this.authService.confirmMfaRecovery(dto);
  }

  @Get('me')
  @AllowCliToken()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }
    return this.authService.updateAvatar(user.id, file);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  removeAccount(@CurrentUser() user: AuthUser) {
    return this.authService.deleteAccount(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logoutCurrentSession(
      user.id,
      user.session_id ?? null,
    );
  }

  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser() user: AuthUser) {
    return this.authService.getMfaStatus(user.id);
  }

  @Post('mfa/dismiss')
  @UseGuards(JwtAuthGuard)
  dismissMfa(@CurrentUser() user: AuthUser) {
    return this.authService.dismissMfa(user.id);
  }

  @Delete('mfa/:factorId')
  @UseGuards(JwtAuthGuard)
  deleteMfaFactor(
    @CurrentUser() user: AuthUser,
    @Param('factorId') factorId: string,
  ) {
    return this.authService.deleteMfaFactor(user.id, factorId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.id, user.session_id ?? null);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(
      user.id,
      sessionId,
      user.session_id ?? null,
    );
  }
}
