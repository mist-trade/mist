import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  parseRedisConnectionUrl,
  STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB,
  STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB,
  STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS,
  STRATEGY_ALERT_DELIVERY_QUEUE_NAME,
  alertDeliveryChannelJobId,
  alertDeliveryFanoutJobId,
  alertDeliverySweepFanoutJobId,
  decodeAlertDeliveryChannelJobV2,
  decodeAlertDeliveryFanoutJobV2,
  type AlertDeliveryChannelJobV2,
  type AlertDeliveryFanoutJobV2,
  type AlertDeliveryGroupDescriptor,
} from '@app/contracts';
import type { AlertDeliveryChannel } from '@app/contracts';

/**
 * Owns the single producer-side BullMQ Queue for strategy-alert-delivery.
 * Consolidates enqueue logic for fanout, channel, and replay so only one Redis
 * producer connection is opened (the worker side runs its own consumer
 * forRootAsync + manualRegistration). Fail-fast connection: enqueue errors
 * surface to callers, which treat them as best-effort.
 *
 * V2 (2026-11-24): jobs are batch-grouped — one fanout per (securityId,
 * effectiveTime) group carrying the group's alertEventIds; the deterministic
 * jobId is group-scoped, so duplicate enqueues (producer retry, sweep) collapse.
 */
@Injectable()
export class AlertDeliveryQueueService implements OnModuleDestroy {
  private readonly queue: Queue;

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

  /** Enqueue deliver.fanout for one group (deterministic group-scoped jobId). */
  async enqueueFanout(
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

  /** Enqueue deliver.fanout for one sweep recovery batch (sweep-scoped jobId). */
  async enqueueSweepFanout(
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
      jobId: alertDeliverySweepFanoutJobId(accepted),
    });
  }

  /** Enqueue deliver.channel for one group + channel (group-scoped jobId). */
  async enqueueChannel(
    group: AlertDeliveryGroupDescriptor,
    alertEventIds: readonly number[],
    channel: AlertDeliveryChannel,
  ): Promise<void> {
    const accepted = decodeAlertDeliveryChannelJobV2({
      contractVersion: 2,
      group,
      channel,
      alertEventIds,
    });
    await this.queue.add(STRATEGY_ALERT_DELIVERY_CHANNEL_JOB, accepted, {
      ...STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
      jobId: alertDeliveryChannelJobId(accepted),
    });
  }

  /**
   * Enqueue a fresh deliver.channel for replay. No deterministic jobId => a new
   * job is always created (the prior failed job lingers in BullMQ's failed set
   * until removeOnFail age cleans it; harmless). The caller must first reset the
   * delivery rows to PENDING so the worker does not idempotently skip them.
   */
  async enqueueChannelReplay(
    group: AlertDeliveryGroupDescriptor,
    alertEventIds: readonly number[],
    channel: AlertDeliveryChannel,
  ): Promise<void> {
    const accepted = decodeAlertDeliveryChannelJobV2({
      contractVersion: 2,
      group,
      channel,
      alertEventIds,
    });
    await this.queue.add(
      STRATEGY_ALERT_DELIVERY_CHANNEL_JOB,
      accepted,
      STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS,
    );
  }

  /** BullMQ job counts by state, for the queue-depth metric. */
  async snapshotCounts(): Promise<{
    waiting: number;
    active: number;
    delayed: number;
  }> {
    const c = await this.queue.getJobCounts('waiting', 'active', 'delayed');
    return {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      delayed: c.delayed ?? 0,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

export type { AlertDeliveryChannelJobV2, AlertDeliveryFanoutJobV2 };
