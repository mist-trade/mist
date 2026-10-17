import type { BaseHealthVo, HealthStatus } from '@app/transport';

export interface NotificationHealthVo extends BaseHealthVo {
  status: HealthStatus;
  service: 'notification';
  instance: 'notification';
  timestamp: string;
}
