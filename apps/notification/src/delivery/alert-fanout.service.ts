import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
  isUniqueConstraintViolation,
} from '@app/shared-data';
import { toErrorMessage } from '@app/utils';
import type { AlertDeliveryFanoutJobV2 } from '@app/contracts';

import type { ChannelAdapter } from '../channels/channel-adapter.port';
import { CHANNEL_ADAPTERS } from '../channels/channel-adapter.port';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';

const DELIVERY_ROW_UNIQUE_CONSTRAINT =
  'uq_strategy_alert_deliveries_event_channel';

/**
 * Handles deliver.fanout for one (securityId, effectiveTime) GROUP (V2): for each
 * committed AlertEvent in the group, ensures a pending strategy_alert_deliveries
 * row per enabled channel, then enqueues ONE deliver.channel job per channel
 * carrying the whole group's ids (group-scoped jobId dedupes re-fanout). Channel
 * list comes from the injected adapters (NOTIFICATION_CHANNELS). No configured
 * channel => fail every event in the group (rather than leaving them PENDING
 * forever with no delivery rows).
 */
@Injectable()
export class AlertFanoutService {
  private readonly logger = new Logger(AlertFanoutService.name);

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapters: readonly ChannelAdapter[],
    private readonly queue: AlertDeliveryQueueService,
  ) {}

  async run(job: AlertDeliveryFanoutJobV2): Promise<void> {
    const events = await this.alertEvents.find({
      where: { id: In(job.alertEventIds) },
    });
    if (events.length === 0) return; // cascade-deleted; nothing to deliver
    const missing = job.alertEventIds.filter(
      (id) => !events.some((event) => event.id === id),
    );
    if (missing.length > 0) {
      this.logger.warn(
        `fanout group securityId=${job.group.securityId} effectiveTime=${job.group.effectiveTime}: ` +
          `events ${missing.join(',')} missing (cascade-deleted); delivering the rest`,
      );
    }

    if (this.adapters.length === 0) {
      this.logger.warn(
        `no notification channels configured (NOTIFICATION_CHANNELS empty) — failing events [${events
          .map((event) => event.id)
          .join(',')}]`,
      );
      await this.alertEvents.update(
        { id: In(events.map((event) => event.id)) },
        { status: StrategyAlertStatus.FAILED },
      );
      return;
    }

    for (const adapter of this.adapters) {
      const channel = adapter.channel;
      for (const event of events) {
        const existing = await this.deliveries.findOne({
          where: { strategyAlertEventId: event.id, channel },
        });
        if (
          existing &&
          (existing.status === StrategyAlertDeliveryStatus.SENT ||
            existing.status === StrategyAlertDeliveryStatus.DEAD_LETTERED)
        ) {
          continue; // terminal already
        }
        if (!existing) {
          try {
            await this.deliveries.save({
              strategyAlertEventId: event.id,
              channel,
              status: StrategyAlertDeliveryStatus.PENDING,
              attemptCount: 0,
            });
          } catch (error) {
            // Only the unique-constraint race (a concurrent fanout already saved
            // this (event, channel) row) is expected; anything else must fail the
            // job loudly — otherwise the row never exists, the channel job is
            // silently dropped by the worker (no row => return), and the event
            // disappears with no log and no metric.
            if (
              !isUniqueConstraintViolation(
                error,
                DELIVERY_ROW_UNIQUE_CONSTRAINT,
              )
            ) {
              this.logger.error(
                `fanout delivery row creation failed event=${event.id} channel=${channel}: ${toErrorMessage(error)}`,
              );
              throw error;
            }
          }
        }
      }
      await this.queue.enqueueChannel(job.group, job.alertEventIds, channel);
    }
  }
}
