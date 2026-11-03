import { Injectable } from '@nestjs/common';
import type { SessionAccess } from './session-access.repository';

const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

type CacheEntry = {
  value: SessionAccess;
  expiresAt: number;
};

@Injectable()
export class SessionAccessCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(userId: string, sessionId: string | null): SessionAccess | null {
    const key = this.keyOf(userId, sessionId);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  set(userId: string, sessionId: string | null, value: SessionAccess) {
    const key = this.keyOf(userId, sessionId);
    this.entries.delete(key);
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + TTL_MS });
  }

  invalidate(userId: string, sessionId: string) {
    this.entries.delete(this.keyOf(userId, sessionId));
  }

  invalidateUser(userId: string) {
    const prefix = `${userId}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  private keyOf(userId: string, sessionId: string | null) {
    return `${userId}:${sessionId ?? '-'}`;
  }
}
