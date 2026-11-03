'use client';

// Minimal sessionStorage seed for light, slow-changing queries
// (entity tree/types, model configs). Zero dependencies, bounded size so
// weak PCs never pay meaningful disk/CPU. Heavy payloads (sources,
// analytics) are intentionally NOT persisted.

const PREFIX = 'layerum:query-cache:v1';
// sessionStorage is typically 5MB; stay far below and fail silent.
const MAX_BYTES = 400_000;

export type CachedQuery<T> = {
  data: T;
  updatedAt: number;
};

export function readCachedQuery<T>(key: string): CachedQuery<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${PREFIX}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedQuery<T>>;
    if (!('data' in parsed) || typeof parsed.updatedAt !== 'number') return null;
    return { data: parsed.data as T, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function writeCachedQuery(key: string, data: unknown, updatedAt: number): void {
  if (typeof window === 'undefined' || data === undefined) return;
  try {
    const raw = JSON.stringify({ data, updatedAt });
    if (raw.length > MAX_BYTES) return;
    window.sessionStorage.setItem(`${PREFIX}:${key}`, raw);
  } catch {
    // Quota or access errors: caching is best-effort, never fatal.
  }
}
