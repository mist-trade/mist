import { ApiProperty } from '@nestjs/swagger';
import type {
  RealtimeProductizationMode,
  RealtimeStrategyMode,
} from '@app/config';
import type { BaseHealthVo, HealthStatus } from '@app/transport';

export class BackendHealthVo implements BaseHealthVo {
  @ApiProperty({ example: 'ok' })
  status!: HealthStatus;

  @ApiProperty({ example: 'mist-backend' })
  service!: string;

  @ApiProperty({ example: 'backend' })
  instance!: string;

  @ApiProperty({ example: '2026-08-26T03:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
  productizationMode!: RealtimeProductizationMode;

  @ApiProperty({ enum: ['off', 'shadow', 'on'], example: 'on' })
  strategyMode!: RealtimeStrategyMode;

  @ApiProperty({ example: true })
  redisAvailable!: boolean;

  @ApiProperty({ example: 4 })
  allowlistCount!: number;

  @ApiProperty({ example: true })
  autoReconcile!: boolean;
}
