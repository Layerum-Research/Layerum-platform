import { crossedQuotaLevel } from './storage-quota';

describe('crossedQuotaLevel', () => {
  it('detects crossing the warning threshold', () => {
    expect(crossedQuotaLevel(80, 95, 100)).toBe('warning');
  });

  it('prefers the reached level when both thresholds are crossed', () => {
    expect(crossedQuotaLevel(50, 100, 100)).toBe('reached');
  });

  it('ignores usage that was already above the threshold', () => {
    expect(crossedQuotaLevel(92, 95, 100)).toBeNull();
  });

  it('ignores unknown capacity', () => {
    expect(crossedQuotaLevel(0, 10, 0)).toBeNull();
  });
});
