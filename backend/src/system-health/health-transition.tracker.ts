import type {
  HealthComponentName,
  HealthComponentStatus,
} from './system-health.types';

const FAILURES_BEFORE_DOWN = 2;

export type HealthTransition =
  | { kind: 'down'; component: HealthComponentName; since: Date }
  | {
      kind: 'recovered';
      component: HealthComponentName;
      downSince: Date;
      recoveredAt: Date;
    };

type ComponentState = {
  consecutiveFailures: number;
  firstFailureAt: Date | null;
  reportedDown: boolean;
};

export class HealthTransitionTracker {
  private readonly states = new Map<HealthComponentName, ComponentState>();

  observe(
    component: HealthComponentName,
    status: HealthComponentStatus,
    now: Date,
  ): HealthTransition | null {
    const state = this.stateOf(component);
    return status === 'down'
      ? this.recordFailure(component, state, now)
      : this.recordSuccess(component, state, now);
  }

  private recordFailure(
    component: HealthComponentName,
    state: ComponentState,
    now: Date,
  ): HealthTransition | null {
    state.consecutiveFailures += 1;
    state.firstFailureAt ??= now;
    if (
      state.reportedDown ||
      state.consecutiveFailures < FAILURES_BEFORE_DOWN
    ) {
      return null;
    }
    state.reportedDown = true;
    return { kind: 'down', component, since: state.firstFailureAt };
  }

  private recordSuccess(
    component: HealthComponentName,
    state: ComponentState,
    now: Date,
  ): HealthTransition | null {
    const downSince = state.reportedDown ? state.firstFailureAt : null;
    this.states.set(component, this.initialState());
    if (!downSince) return null;
    return { kind: 'recovered', component, downSince, recoveredAt: now };
  }

  private stateOf(component: HealthComponentName) {
    const existing = this.states.get(component);
    if (existing) return existing;
    const created = this.initialState();
    this.states.set(component, created);
    return created;
  }

  private initialState(): ComponentState {
    return {
      consecutiveFailures: 0,
      firstFailureAt: null,
      reportedDown: false,
    };
  }
}
