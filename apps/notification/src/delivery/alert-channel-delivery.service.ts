import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  NotificationChannel,
  Security,
  StrategyAlertDelivery,
  StrategyAlertDeliveryStatus,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategyDefinition,
  StrategySignal,
} from '@app/shared-data';
import { toErrorMessage } from '@app/utils';
import type { AlertDeliveryChannelJobV2 } from '@app/contracts';

import {
  CHANNEL_ADAPTERS,
  type ChannelAdapter,
  type ChannelSendResult,
} from '../channels/channel-adapter.port';
import {
  buildGroupedNotificationMessage,
  type GroupedNotificationItem,
} from './notification-envelope';
import { NotificationDeliveryCounters } from './notification-delivery-counters';

const MAX_LAST_ERROR = 1024;

/**
 * Handles deliver.channel for one (group, channel) job (V2): loads the whole
 * group's evidence, builds ONE channel-neutral grouped message, calls the channel
 * adapter once, writes the per-channel delivery result for every delivered row
 * (same providerMessageId), records metrics, and reconciles each AlertEvent
 * aggregate status. Transient failures throw so BullMQ retries; permanent
 * failures and exhausted retries dead-letter without throwing (job completes;
 * the DB rows are the source of truth).
 */
@Injectable()
export class AlertChannelDeliveryService {
  private readonly logger = new Logger(AlertChannelDeliveryService.name);

  constructor(
    @InjectRepository(StrategyAlertEvent)
    private readonly alertEvents: Repository<StrategyAlertEvent>,
    @InjectRepository(StrategySignal)
    private readonly signals: Repository<StrategySignal>,
    @InjectRepository(Security)
    private readonly securities: Repository<Security>,
    @InjectRepository(StrategyAlertDelivery)
    private readonly deliveries: Repository<StrategyAlertDelivery>,
    @InjectRepository(StrategyDefinition)
    private readonly strategyDefinitions: Repository<StrategyDefinition>,
    @Inject(CHANNEL_ADAPTERS)
    private readonly adapters: readonly ChannelAdapter[],
    private readonly counters: NotificationDeliveryCounters,
  ) {}

  async run(
    job: AlertDeliveryChannelJobV2,
    attemptsMade: number,
    maxAttempts: number,
  ): Promise<void> {
    // Bridge the contract's pure literal union to the NotificationChannel enum
    // (used by the entity column + adapters). Values are guaranteed equal by decode.
    const channel = toNotificationChannel(job.channel);
    const rows = await this.deliveries.find({
      where: {
        strategyAlertEventId: In(job.alertEventIds),
        channel,
      },
    });
    if (rows.length === 0) return;
    const work = rows.filter(
      (row) =>
        row.status !== StrategyAlertDeliveryStatus.SENT &&
        row.status !== StrategyAlertDeliveryStatus.DEAD_LETTERED,
    );
    if (work.length === 0) return; // idempotent skip: every row terminal

    const adapter = this.adapters.find((a) => a.channel === channel);
    if (!adapter) {
      // Short-circuit before loading evidence: no adapter for this channel.
      this.counters.recordDeadLetter(channel);
      for (const row of work) {
        await this.updateDeliveryStatus(
          row.id,
          StrategyAlertDeliveryStatus.DEAD_LETTERED,
          row.attemptCount,
          `no adapter configured for channel ${channel}`,
        );
        await this.reconcile(row.strategyAlertEventId);
      }
      return;
    }

    const alertEventIds = work.map((row) => row.strategyAlertEventId);
    const alertEvents = await this.alertEvents.find({
      where: { id: In(alertEventIds) },
    });
    if (alertEvents.length === 0) return;
    const signals = await this.signals.find({
      where: { id: In(alertEvents.map((event) => event.strategySignalId)) },
    });
    const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
    const securityIds = [
      ...new Set(signals.map((signal) => signal.securityId)),
    ];
    const definitionIds = [
      ...new Set(signals.map((signal) => signal.strategyDefinitionId)),
    ];
    const securities = await this.securities.find({
      where: { id: In(securityIds) },
    });
    const securitiesById = new Map(securities.map((s) => [s.id, s]));
    const definitions = await this.strategyDefinitions.find({
      where: { id: In(definitionIds) },
    });
    const definitionsById = new Map(definitions.map((d) => [d.id, d]));

    const items: GroupedNotificationItem[] = [];
    for (const event of alertEvents) {
      const signal = signalsById.get(event.strategySignalId) ?? null;
      items.push({
        alertEvent: event,
        signal,
        security: signal
          ? (securitiesById.get(signal.securityId) ?? null)
          : null,
        strategyDefinition: signal
          ? (definitionsById.get(signal.strategyDefinitionId) ?? null)
          : null,
      });
    }

    const message = buildGroupedNotificationMessage(items);
    let result: ChannelSendResult;
    try {
      result = await adapter.send({ text: message });
    } catch (error) {
      result = {
        status: 'transient_failure',
        error: toErrorMessage(error),
      };
    }
    this.counters.recordAttempt(channel);

    if (result.status === 'sent') {
      this.counters.recordSent(channel);
      for (const row of work) {
        await this.deliveries.update(row.id, {
          status: StrategyAlertDeliveryStatus.SENT,
          attemptCount: row.attemptCount + 1,
          providerMessageId: result.providerMessageId ?? null,
          sentAt: new Date(),
          lastError: null,
        });
        await this.reconcile(row.strategyAlertEventId);
      }
      this.logger.log(
        `delivered group channel=${channel} events=[${alertEventIds.join(',')}] attempt=${attemptsMade + 1}`,
      );
      return;
    }

    const isLastAttempt = attemptsMade + 1 >= maxAttempts;
    const terminal = result.status === 'permanent_failure' || isLastAttempt;
    const newStatus = terminal
      ? StrategyAlertDeliveryStatus.DEAD_LETTERED
      : StrategyAlertDeliveryStatus.FAILED;
    this.counters.recordFailure(channel);
    for (const row of work) {
      await this.updateDeliveryStatus(
        row.id,
        newStatus,
        row.attemptCount + 1,
        result.error,
      );
      await this.reconcile(row.strategyAlertEventId);
    }

    if (result.status === 'transient_failure' && !terminal) {
      throw new Error(
        `transient delivery failure channel=${channel} events=[${alertEventIds.join(',')}]: ${result.error ?? 'unknown'}`,
      );
    }
    this.counters.recordDeadLetter(channel);
    this.logger.warn(
      `delivery dead-lettered channel=${channel} events=[${alertEventIds.join(',')}]: ${result.error ?? 'exhausted retries'}`,
    );
  }

  private async updateDeliveryStatus(
    id: number,
    status: StrategyAlertDeliveryStatus,
    attemptCount: number,
    error?: string,
  ): Promise<void> {
    await this.deliveries.update(id, {
      status,
      attemptCount,
      lastError: truncate(error),
    });
  }

  private async reconcile(alertEventId: number): Promise<void> {
    const all = await this.deliveries.find({
      where: { strategyAlertEventId: alertEventId },
    });
    if (all.length === 0) return;
    const anyDeadLetter = all.some(
      (d) => d.status === StrategyAlertDeliveryStatus.DEAD_LETTERED,
    );
    const allSent = all.every(
      (d) => d.status === StrategyAlertDeliveryStatus.SENT,
    );
    let next: StrategyAlertStatus | null = null;
    if (anyDeadLetter) next = StrategyAlertStatus.FAILED;
    else if (allSent) next = StrategyAlertStatus.DELIVERED;
    if (next) await this.alertEvents.update(alertEventId, { status: next });
  }
}

function truncate(error?: string): string | null {
  if (!error) return null;
  return error.length > MAX_LAST_ERROR ? error.slice(0, MAX_LAST_ERROR) : error;
}

function toNotificationChannel(
  channel: 'qq' | 'wechat' | 'feishu',
): NotificationChannel {
  if (channel === 'qq') return NotificationChannel.QQ;
  if (channel === 'feishu') return NotificationChannel.FEISHU;
  return NotificationChannel.WECHAT;
}
