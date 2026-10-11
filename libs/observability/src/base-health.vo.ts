export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface BaseHealthVo {
  readonly status: HealthStatus;
  readonly service: string;
  readonly instance: string;
  readonly timestamp: string;
  readonly version?: string;
}
