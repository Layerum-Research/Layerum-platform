import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { SupabaseService } from '../supabase/supabase.service';
import { EmailService } from '../email/email.service';
import { SessionAccessCache } from '../common/auth/session-access.cache';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { SignInPasswordDto } from './dto/sign-in-password.dto';
import type { SignUpPasswordDto } from './dto/sign-up-password.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type {
  MfaRecoveryConfirmDto,
  MfaRecoveryRequestDto,
} from './dto/mfa-recovery.dto';

const MFA_RECOVERY_TTL_MS = 15 * 60 * 1000;

type MfaRecoveryRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
};

type AvatarRow = {
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
};

type SessionRow = {
  id: string;
  session_id: string;
  ip_address: string | null;
  user_agent: string | null;
  os_name: string | null;
  browser_name: string | null;
  device_type: string | null;
  device_label: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
};

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly email: EmailService,
    private readonly sessionAccessCache: SessionAccessCache,
  ) {}

  async signInWithPassword(dto: SignInPasswordDto) {
    const { data, error } = await this.supabase.anon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) throw new UnauthorizedException(error.message);
    if (!data.session) throw new UnauthorizedException('Session not created');

    return {
      user: data.user,
      session: data.session,
    };
  }

  async signUpWithPassword(dto: SignUpPasswordDto) {
    const { data, error } = await this.supabase.admin.auth.admin.generateLink({
      type: 'signup',
      email: dto.email,
      password: dto.password,
      options: {
        data: { full_name: dto.fullName },
      },
    });

    if (error) throw new BadRequestException(error.message);

    try {
      await this.email.sendTextEmail({
        to: dto.email,
        subject: 'Your Layerum confirmation code',
        textBody: `Your confirmation code is: ${data.properties.email_otp}\n\nEnter this code to confirm your account.\n\nIf you did not create this account, you can safely ignore this email.`,
      });
    } catch (emailError) {
      this.logger.error(`Failed to send signup confirmation code to ${maskEmail(dto.email)}: ${this.errorMessage(emailError)}`);
    }

    return {
      user: data.user,
      session: null,
      sessionCreated: false,
      needsEmailConfirmation: true,
    };
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
    const redirectTo = `${frontendUrl}/set-password`;

    const { data, error } = await this.supabase.admin.auth.admin.generateLink({
      type: 'recovery',
      email: dto.email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.hashed_token) {
      this.logger.warn(`Password reset link generation skipped for ${maskEmail(dto.email)}: ${error?.message ?? 'no link'}`);
      return { success: true };
    }

    const resetLink = `${redirectTo}?token_hash=${data.properties.hashed_token}&type=recovery`;

    try {
      await this.email.sendTextEmail({
        to: dto.email,
        subject: 'Reset your Layerum password',
        textBody: `Click the link below to reset your password. This link expires in 1 hour.\n\n${resetLink}\n\nIf you did not request a password reset, you can safely ignore this email.`,
      });
    } catch (emailError) {
      this.logger.error(`Failed to send password reset email to ${maskEmail(dto.email)}: ${this.errorMessage(emailError)}`);
    }

    return { success: true };
  }

  async getMe(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('users')
      .select('id, email, full_name, avatar_url, metadata')
      .eq('id', userId)
      .maybeSingle<UserRow>();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('User not found');

    const avatarUrl = this.supabase.getPublicUrl(
      'sources',
      data.avatar_url ?? '',
    );

    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      avatar_url: avatarUrl,
      metadata: data.metadata ?? {},
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { data: currentUser, error: currentUserError } =
      await this.supabase.admin
        .from('users')
        .select('id, email, full_name, avatar_url, metadata')
        .eq('id', userId)
        .maybeSingle<UserRow>();

    if (currentUserError) throw new Error(currentUserError.message);
    if (!currentUser) throw new NotFoundException('User not found');

    const nextFullName: string | null =
      typeof dto.full_name !== 'undefined'
        ? (dto.full_name ?? null)
        : currentUser.full_name;
    const nextEmail = dto.email ?? currentUser.email;
    const nextMetadata = {
      ...(currentUser.metadata ?? {}),
      full_name: nextFullName,
    };

    const profileChanged =
      nextFullName !== currentUser.full_name || nextEmail !== currentUser.email;

    if (!profileChanged) {
      return this.getMe(userId);
    }

    const previousProfile = {
      email: currentUser.email,
      full_name: currentUser.full_name,
      metadata: currentUser.metadata ?? {},
    };

    const { error: profileError } = await this.supabase.admin
      .from('users')
      .update({
        email: nextEmail,
        full_name: nextFullName,
        metadata: nextMetadata,
      })
      .eq('id', userId);

    if (profileError) throw new Error(profileError.message);

    try {
      const { error: authError } =
        await this.supabase.admin.auth.admin.updateUserById(userId, {
          email: nextEmail !== currentUser.email ? nextEmail : undefined,
          user_metadata: nextMetadata,
        });
      if (authError) throw new Error(authError.message);
    } catch (error) {
      const { error: rollbackError } = await this.supabase.admin
        .from('users')
        .update(previousProfile)
        .eq('id', userId);
      if (rollbackError) throw new Error(rollbackError.message);
      throw error;
    }

    return this.getMe(userId);
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Avatar must be a PNG, JPEG, WebP, or GIF image',
      );
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('Avatar must be 2 MB or smaller');
    }

    const { data: currentUser, error: currentUserError } =
      await this.supabase.admin
        .from('users')
        .select('avatar_url, metadata')
        .eq('id', userId)
        .maybeSingle<AvatarRow>();

    if (currentUserError) throw new Error(currentUserError.message);
    if (!currentUser) throw new NotFoundException('User not found');

    const oldAvatarUrl = currentUser.avatar_url ?? null;
    const extension = this.getAvatarExtension(file.mimetype, file.originalname);
    const objectKey = `avatars/${userId}/${Date.now()}-${randomUUID()}${extension}`;
    const metadata = {
      ...(currentUser.metadata ?? {}),
      avatar_url: objectKey,
    };

    await this.supabase.uploadObject(
      'sources',
      objectKey,
      file.buffer,
      file.mimetype,
    );

    try {
      const { error: authError } =
        await this.supabase.admin.auth.admin.updateUserById(userId, {
          user_metadata: metadata,
        });
      if (authError) throw new Error(authError.message);

      const { error: profileError } = await this.supabase.admin
        .from('users')
        .update({
          avatar_url: objectKey,
          metadata,
        })
        .eq('id', userId);

      if (profileError) throw new Error(profileError.message);
    } catch (error) {
      const { error: rollbackError } =
        await this.supabase.admin.auth.admin.updateUserById(userId, {
          user_metadata: currentUser.metadata ?? {},
        });
      if (rollbackError) throw new Error(rollbackError.message);

      await this.supabase.removeObjects('sources', [objectKey]);
      throw error;
    }

    if (oldAvatarUrl?.startsWith('avatars/')) {
      await this.supabase.removeObjects('sources', [oldAvatarUrl]);
    }

    return {
      success: true,
      avatar_url: this.supabase.getPublicUrl('sources', objectKey),
      avatar_path: objectKey,
    };
  }

  async deleteAccount(userId: string) {
    const { data: ownedWorkspaces, error: ownedWorkspacesError } =
      await this.supabase.admin
        .from('workspaces')
        .select('id, name, slug')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

    if (ownedWorkspacesError) throw new Error(ownedWorkspacesError.message);

    if ((ownedWorkspaces ?? []).length > 0) {
      throw new ConflictException({
        message: 'Delete blocked: remove your workspaces first',
        details: {
          code: 'WORKSPACES_EXIST',
          count: ownedWorkspaces?.length ?? 0,
          workspaces: ownedWorkspaces ?? [],
        },
      });
    }

    const avatarPath = await this.getUserAvatarPath(userId);
    const { error: deleteError } =
      await this.supabase.admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(deleteError.message);
    this.sessionAccessCache.invalidateUser(userId);

    await this.cleanupDeletedAccountArtifacts(userId, avatarPath);
    return { success: true };
  }

  async getMfaStatus(userId: string) {
    const { data: factorsData, error: factorsError } =
      await this.supabase.admin.auth.admin.mfa.listFactors({ userId });
    if (factorsError) throw new Error(factorsError.message);

    const factors = (factorsData?.factors ?? []).map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name ?? null,
      factorType: factor.factor_type,
      status: factor.status,
      createdAt: factor.created_at,
      lastChallengedAt: factor.last_challenged_at ?? null,
    }));
    const enrolled = factors.some((factor) => factor.status === 'verified');

    const { data: userRow, error: userError } = await this.supabase.admin
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle<{ metadata: Record<string, unknown> | null }>();
    if (userError) throw new Error(userError.message);

    const metadata = (userRow?.metadata ?? {}) as Record<string, unknown>;
    const dismissedAt =
      typeof metadata['mfa_dismissed_at'] === 'string'
        ? (metadata['mfa_dismissed_at'] as string)
        : null;

    return { enrolled, factors, dismissedAt };
  }

  async dismissMfa(userId: string) {
    const dismissedAt = new Date().toISOString();
    await this.patchUserMetadata(userId, { mfa_dismissed_at: dismissedAt });
    return { success: true, dismissedAt };
  }

  async deleteMfaFactor(userId: string, factorId: string) {
    const { data, error } =
      await this.supabase.admin.auth.admin.mfa.deleteFactor({
        id: factorId,
        userId,
      });
    if (error) throw new Error(error.message);
    // Clear dismissal flag so enforcement re-evaluates cleanly after reset.
    await this.patchUserMetadata(userId, { mfa_dismissed_at: null });
    return { success: true, factorId: data?.id ?? factorId };
  }

  async requestMfaRecovery(dto: MfaRecoveryRequestDto) {
    // Always return success to prevent email enumeration.
    const { data: userRow } = await this.supabase.admin
      .from('users')
      .select('id, email')
      .eq('email', dto.email)
      .maybeSingle<{ id: string; email: string }>();

    if (userRow) {
      const { data: factorsData } = await this.supabase.admin.auth.admin.mfa.listFactors({
        userId: userRow.id,
      });
      const enrolled = (factorsData?.factors ?? []).some(
        (factor) => factor.status === 'verified',
      );
      if (enrolled) {
        const token = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + MFA_RECOVERY_TTL_MS).toISOString();

        // Invalidate older unused tokens for this user.
        await this.supabase.admin
          .from('mfa_recovery_tokens')
          .update({ used_at: new Date().toISOString() })
          .eq('user_id', userRow.id)
          .is('used_at', null);

        const { error: insertError } = await this.supabase.admin
          .from('mfa_recovery_tokens')
          .insert({ user_id: userRow.id, token_hash: tokenHash, expires_at: expiresAt });
        if (insertError) {
          this.logger.error(`Failed to store MFA recovery token: ${insertError.message}`);
        } else {
          const frontendUrl = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
          const recoveryLink = `${frontendUrl}/mfa-recovery?token=${token}`;
          try {
            await this.email.sendTextEmail({
              to: userRow.email,
              subject: 'Reset your Layerum two-factor authentication',
              textBody: `Someone requested to reset two-factor authentication for this account.\n\nClick the link below within 15 minutes. After reset you will sign in with your password and set up a new authenticator app.\n\n${recoveryLink}\n\nIf you did not request this, you can safely ignore this email — your authenticator stays active.`,
            });
          } catch (emailError) {
            this.logger.error(
              `Failed to send MFA recovery email to ${maskEmail(userRow.email)}: ${this.errorMessage(emailError)}`,
            );
          }
        }
      }
    }

    return { success: true };
  }

  async confirmMfaRecovery(dto: MfaRecoveryConfirmDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    // Atomically claim the token: only an unused, unexpired row can be marked.
    const { data: claimed, error: claimError } = await this.supabase.admin
      .from('mfa_recovery_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id, user_id')
      .maybeSingle<{ id: string; user_id: string }>();

    if (claimError || !claimed) {
      throw new BadRequestException('Recovery link is invalid or expired');
    }

    const { data: factorsData, error: factorsError } =
      await this.supabase.admin.auth.admin.mfa.listFactors({ userId: claimed.user_id });
    if (factorsError) throw new Error(factorsError.message);

    for (const factor of factorsData?.factors ?? []) {
      const { error: deleteError } =
        await this.supabase.admin.auth.admin.mfa.deleteFactor({
          id: factor.id,
          userId: claimed.user_id,
        });
      if (deleteError) throw new Error(deleteError.message);
    }

    // Clear dismissal flag so the setup nudge appears on next login.
    await this.patchUserMetadata(claimed.user_id, { mfa_dismissed_at: null });

    return { success: true };
  }

  async logoutCurrentSession(userId: string, sessionId: string | null = null) {
    if (!sessionId) {
      return { success: true, revokedSessionId: null };
    }

    await this.markSessionRevoked(userId, sessionId);
    return { success: true, revokedSessionId: sessionId };
  }

  async listSessions(userId: string, currentSessionId: string | null = null) {
    const { data, error } = await this.supabase.admin
      .from('user_sessions')
      .select(
        'id, session_id, ip_address, user_agent, os_name, browser_name, device_type, device_label, first_seen_at, last_seen_at, revoked_at',
      )
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false });

    if (error) throw new Error(error.message);

    return {
      items: (data ?? []).map((row) => {
        const sessionRow = row as SessionRow;
        return {
          id: sessionRow.id,
          sessionId: sessionRow.session_id,
          ipAddress: sessionRow.ip_address,
          userAgent: sessionRow.user_agent,
          osName: sessionRow.os_name,
          browserName: sessionRow.browser_name,
          deviceType: sessionRow.device_type,
          deviceLabel: sessionRow.device_label,
          firstSeenAt: sessionRow.first_seen_at,
          lastSeenAt: sessionRow.last_seen_at,
          revokedAt: sessionRow.revoked_at,
          isCurrent:
            Boolean(currentSessionId) &&
            sessionRow.session_id === currentSessionId,
        };
      }),
    };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string | null = null,
  ) {
    const { data: existing, error: existingError } = await this.supabase.admin
      .from('user_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new NotFoundException('Session not found');

    const { error } = await this.supabase.admin
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_id', sessionId);
    if (error) throw new Error(error.message);
    this.sessionAccessCache.invalidate(userId, sessionId);

    return {
      success: true,
      revokedSessionId: sessionId,
      revokedCurrentSession:
        Boolean(currentSessionId) && currentSessionId === sessionId,
    };
  }

  private getAvatarExtension(mimetype: string, originalName: string) {
    const byType: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    return byType[mimetype] ?? (extname(originalName || '') || '.png');
  }

  private async getUserAvatarPath(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('users')
      .select('avatar_url')
      .eq('id', userId)
      .maybeSingle<{ avatar_url: string | null }>();

    if (error) throw new Error(error.message);

    const avatarUrl = data?.avatar_url?.trim() ?? '';
    if (!avatarUrl.startsWith(`avatars/${userId}/`)) return null;
    return avatarUrl;
  }

  private async patchUserMetadata(
    userId: string,
    patch: Record<string, unknown>,
  ) {
    const { data: current, error: readError } = await this.supabase.admin
      .from('users')
      .select('metadata')
      .eq('id', userId)
      .maybeSingle<{ metadata: Record<string, unknown> | null }>();
    if (readError) throw new Error(readError.message);
    if (!current) throw new NotFoundException('User not found');

    const nextMetadata = { ...(current.metadata ?? {}), ...patch };
    const { error: updateError } = await this.supabase.admin
      .from('users')
      .update({ metadata: nextMetadata })
      .eq('id', userId);
    if (updateError) throw new Error(updateError.message);

    try {
      const { error: authError } =
        await this.supabase.admin.auth.admin.updateUserById(userId, {
          user_metadata: nextMetadata,
        });
      if (authError) throw new Error(authError.message);
    } catch (error) {
      // Best-effort rollback of the public row; auth metadata sync is secondary.
      await this.supabase.admin
        .from('users')
        .update({ metadata: current.metadata ?? {} })
        .eq('id', userId);
      throw error;
    }
    return nextMetadata;
  }

  private async markSessionRevoked(userId: string, sessionId: string) {
    const { error } = await this.supabase.admin
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_id', sessionId);
    if (error) throw new Error(error.message);
    this.sessionAccessCache.invalidate(userId, sessionId);
  }

  private async cleanupDeletedAccountArtifacts(
    userId: string,
    avatarPath: string | null,
  ) {
    if (avatarPath) {
      try {
        await this.supabase.removeObjects('sources', [avatarPath]);
      } catch (error) {
        this.logger.warn(
          `Failed to remove deleted account avatar for user ${userId}: ${this.errorMessage(error)}`,
        );
      }
    }

    try {
      const { error } = await this.supabase.admin
        .from('user_sessions')
        .delete()
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    } catch (error) {
      this.logger.warn(
        `Failed to remove deleted account sessions for user ${userId}: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
