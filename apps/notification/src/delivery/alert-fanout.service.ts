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

    const existingRows = await this.deliveries.find({
      where: {
        strategyAlertEventId: In(events.map((event) => event.id)),
      },
    });
    const existingByKey = new Map(
      existingRows.map((row) => [
        `${row.strategyAlertEventId}\u0000${row.channel}`,
        row,
      ]),
    );

    for (const adapter of this.adapters) {
      const channel = adapter.channel;
      const missingPayloads = [];
      for (const event of events) {
        const existing = existingByKey.get(`${event.id}\u0000${channel}`);
        if (existing) {
          continue;
        }
        missingPayloads.push({
          strategyAlertEventId: event.id,
          channel,
          status: StrategyAlertDeliveryStatus.PENDING,
          attemptCount: 0,
        });
      }

      if (missingPayloads.length > 0) {
        try {
          await this.deliveries.save(missingPayloads);
        } catch (error) {
          if (
            missingPayloads.length === 1 &&
            !isUniqueConstraintViolation(error, DELIVERY_ROW_UNIQUE_CONSTRAINT)
          ) {
            this.logger.error(
              `fanout delivery row creation failed event=${missingPayloads[0].strategyAlertEventId} channel=${channel}: ${toErrorMessage(error)}`,
            );
            throw error;
          }
          if (missingPayloads.length > 1) {
            // 仅当批量保存碰撞 unique 键时退回逐条兜底，隔离真正异常与并发重复
            for (const payload of missingPayloads) {
              try {
                await this.deliveries.save(payload);
              } catch (singleError) {
                if (
                  !isUniqueConstraintViolation(
                    singleError,
                    DELIVERY_ROW_UNIQUE_CONSTRAINT,
                  )
                ) {
                  this.logger.error(
                    `fanout delivery row creation failed event=${payload.strategyAlertEventId} channel=${channel}: ${toErrorMessage(singleError)}`,
                  );
                  throw singleError;
                }
              }
            }
          }
        }
      }
      await this.queue.enqueueChannel(job.group, job.alertEventIds, channel);
    }
  }
}
