export type HealthComponentName = 'backend' | 'database' | 'qdrant' | 'redis';

export type HealthComponentStatus =
  | 'up'
  | 'down'
  | 'degraded'
  | 'not_configured';

export type HealthComponent = {
  name: HealthComponentName;
  status: HealthComponentStatus;
  latencyMs: number | null;
  message: string | null;
};
