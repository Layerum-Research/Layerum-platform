import { HealthTransitionTracker } from './health-transition.tracker';

const at = (seconds: number) => new Date(seconds * 1000);

describe('HealthTransitionTracker', () => {
  it('reports down after two consecutive failures, once', () => {
    const tracker = new HealthTransitionTracker();

    expect(tracker.observe('redis', 'down', at(0))).toBeNull();
    expect(tracker.observe('redis', 'down', at(60))).toEqual({
      kind: 'down',
      component: 'redis',
      since: at(0),
    });
    expect(tracker.observe('redis', 'down', at(120))).toBeNull();
  });

  it('reports recovery with the downtime window', () => {
    const tracker = new HealthTransitionTracker();
    tracker.observe('qdrant', 'down', at(0));
    tracker.observe('qdrant', 'down', at(60));

    expect(tracker.observe('qdrant', 'degraded', at(120))).toEqual({
      kind: 'recovered',
      component: 'qdrant',
      downSince: at(0),
      recoveredAt: at(120),
    });
  });

  it('ignores a single failed check', () => {
    const tracker = new HealthTransitionTracker();
    tracker.observe('database', 'down', at(0));

    expect(tracker.observe('database', 'up', at(60))).toBeNull();
  });
});
