import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategySignal,
} from '@app/shared-data';
import { availabilityKey } from '@app/strategy';
import { formatShanghaiDateString } from '@app/timezone';
import type { AlertDeliveryGroupDescriptor } from '@app/contracts';
import { AlertDeliveryQueueService } from './alert-delivery-queue.service';

/**
 * Operator replay: re-push a failed/dead-lettered AlertEvent's deliveries without
 * re-running strategy. Resets each non-terminal-since delivery row to PENDING
 * (attempt_count=0, last_error=null) so the worker does not idempotently skip it,
 * re-enqueues a fresh deliver.channel job (no jobId => always new; V2 payload is a
 * single-element group derived in memory from the alert's signal), and drops the
 * AlertEvent back to PENDING so reconcile can re-evaluate as channels complete.
 *
 * Replay is per-event: a replayed group member renders with the single-signal
 * format. Full-group re-derivation happens on the pending-alert sweep path.
 */
@Injectable()
export class AlertReplayService {
  private readonly logger = new Logger(AlertReplayService.name);

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @InjectRepository(StrategySignal)
    private readonly signals: Repository<StrategySignal>,
    private readonly queue: AlertDeliveryQueueService,
  ) {}

  async replay(alertEventId: number): Promise<{ replayed: number }> {
    const event = await this.alertEvents.findOne({
      where: { id: alertEventId },
    });
    if (!event) {
      throw new NotFoundException(`AlertEvent ${alertEventId} not found`);
    }

    const stuck = await this.deliveries.find({
      where: {
        strategyAlertEventId: alertEventId,
        status: In([
          StrategyAlertDeliveryStatus.FAILED,
          StrategyAlertDeliveryStatus.DEAD_LETTERED,
        ]),
      },
    });
    if (stuck.length === 0) {
      this.logger.log(
        `replay: no failed/dead-lettered deliveries for event ${alertEventId}`,
      );
      return { replayed: 0 };
    }

    const signal = await this.signals.findOne({
      where: { id: event.strategySignalId },
    });
    if (!signal) {
      this.logger.warn(
        `replay: signal ${event.strategySignalId} missing for event ${alertEventId} — cannot derive the V2 group descriptor`,
      );
      return { replayed: 0 };
    }
    const effectiveTime = availabilityKey({
      period: signal.period,
      timestamp: signal.signalTime,
    });
    const group: AlertDeliveryGroupDescriptor = {
      securityId: signal.securityId,
      effectiveTime: effectiveTime.toISOString(),
      tradingDay: formatShanghaiDateString(effectiveTime),
    };

    // Drop aggregate back to PENDING BEFORE enqueueing replay jobs so an early
    // worker completion cannot be overwritten back to PENDING.
    await this.alertEvents.update(alertEventId, {
      status: StrategyAlertStatus.PENDING,
    });
    for (const delivery of stuck) {
      await this.deliveries.update(delivery.id, {
        status: StrategyAlertDeliveryStatus.PENDING,
        attemptCount: 0,
        lastError: null,
      });
      await this.queue.enqueueChannelReplay(
        group,
        [alertEventId],
        delivery.channel,
      );
    }
    this.logger.log(
      `replay: re-enqueued ${stuck.length} channel(s) for event ${alertEventId}`,
    );
    return { replayed: stuck.length };
  }
}
