import type { WrappedDek } from '../types';

export interface KeyProvider {
  readonly kind: WrappedDek['provider'];
  generateWrappedDek(workspaceId: string): Promise<{ wrapped: WrappedDek; plaintextDek: Buffer }>;
  unwrapDek(input: WrappedDek): Promise<Buffer>;
}
