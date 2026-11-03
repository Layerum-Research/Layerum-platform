import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { ParsedUserAgent } from './user-agent.parser';

export type SessionAccess = {
  userExists: boolean;
  revoked: boolean;
};

export type SessionAccessInput = {
  userId: string;
  sessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  device: ParsedUserAgent;
};

export abstract class SessionAccessRepository {
  abstract authorize(input: SessionAccessInput): Promise<SessionAccess>;
}

@Injectable()
export class SupabaseSessionAccessRepository extends SessionAccessRepository {
  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  async authorize(input: SessionAccessInput): Promise<SessionAccess> {
    const { data, error } = await this.supabase.admin.rpc(
      'authorize_user_session',
      {
        p_user_id: input.userId,
        p_session_id: input.sessionId,
        p_ip_address: input.ipAddress,
        p_user_agent: input.userAgent,
        p_os_name: input.device.osName,
        p_browser_name: input.device.browserName,
        p_device_type: input.device.deviceType,
        p_device_label: input.device.deviceLabel,
      },
    );
    if (error) throw new Error(error.message);

    const row = data?.[0];
    return {
      userExists: row?.user_exists ?? false,
      revoked: row?.session_revoked ?? false,
    };
  }
}
