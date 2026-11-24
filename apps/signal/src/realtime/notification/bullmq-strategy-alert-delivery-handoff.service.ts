import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  parseRedisConnectionUrl,
  STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS,
  STRATEGY_ALERT_DELIVERY_QUEUE_NAME,
  alertDeliveryFanoutJobId,
  decodeAlertDeliveryFanoutJobV2,
  type AlertDeliveryFanoutJobV2,
  type AlertDeliveryGroupDescriptor,
} from '@app/contracts';
import type { StrategyAlertDeliveryHandoffPort } from './strategy-alert-delivery-handoff.port';

/**
 * Enqueues batch-grouped deliver.fanout jobs onto the strategy-alert-delivery
 * BullMQ queue (V2 contract: one job per (securityId, effectiveTime) group).
 *
 * Uses a dedicated producer Redis connection (fail-fast: enableOfflineQueue=false,
 * maxRetriesPerRequest=1) instead of BullModule.forRootAsync, because apps/signal
 * already runs a BullMQ consumer forRootAsync with manualRegistration + worker
 * semantics (maxRetriesPerRequest:null). A separate Queue keeps the producer
 * fail-fast and avoids a second forRoot registration.
 */
@Injectable()
export class BullMqStrategyAlertDeliveryHandoffService
  implements StrategyAlertDeliveryHandoffPort, OnModuleDestroy
{
  private readonly queue: Queue<AlertDeliveryFanoutJobV2>;

  constructor(config: ConfigService) {
    this.queue = new Queue(STRATEGY_ALERT_DELIVERY_QUEUE_NAME, {
      connection: {
        ...parseRedisConnectionUrl(
          config.get<string>('MIST_REALTIME_REDIS_URL') ?? '',
        ),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
        commandTimeout: 3_000,
      },
      prefix: STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
    });
  }

  async publishGroup(
    group: AlertDeliveryGroupDescriptor,
    alertEventIds: readonly number[],
  ): Promise<void> {
    const accepted = decodeAlertDeliveryFanoutJobV2({
      contractVersion: 2,
      group,
      alertEventIds,
    });
    await this.queue.add(STRATEGY_ALERT_DELIVERY_FANOUT_JOB, accepted, {
      ...STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS,
      jobId: alertDeliveryFanoutJobId(accepted),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
