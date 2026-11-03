export type StorageQuotaLevel = 'warning' | 'reached';

const QUOTA_THRESHOLDS: ReadonlyArray<{
  level: StorageQuotaLevel;
  ratio: number;
}> = [
  { level: 'reached', ratio: 1 },
  { level: 'warning', ratio: 0.9 },
];

export function crossedQuotaLevel(
  usedBeforeBytes: number,
  usedAfterBytes: number,
  capacityBytes: number,
): StorageQuotaLevel | null {
  if (capacityBytes <= 0) return null;
  const crossed = QUOTA_THRESHOLDS.find(({ ratio }) => {
    const limit = capacityBytes * ratio;
    return usedBeforeBytes < limit && usedAfterBytes >= limit;
  });
  return crossed?.level ?? null;
}
