import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  DataSource as MarketDataSource,
  Period,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategySignal,
  StrategySignalKind,
  StrategySignalSource,
  isUniqueConstraintViolation,
} from '@app/shared-data';
import type { ShadowStrategyCandidate } from '@app/signal';
import { mapKernelSignalToPersistencePayload } from '@app/strategy';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import {
  STRATEGY_ALERT_DELIVERY_HANDOFF_PORT,
  type StrategyAlertDeliveryHandoffPort,
} from './notification/strategy-alert-delivery-handoff.port';

export type LiveStrategyPersistenceOutcome = 'created' | 'duplicate_skipped';

const ALERT_DEDUPE_CONSTRAINT = 'uq_strategy_alert_events_dedupe_key';

@Injectable()
export class LiveStrategyPersistenceService {
  private readonly logger = new Logger(LiveStrategyPersistenceService.name);

  constructor(
    private readonly dataSource: TypeOrmDataSource,
    @Optional()
    @Inject(STRATEGY_ALERT_DELIVERY_HANDOFF_PORT)
    private readonly deliveryHandoff: StrategyAlertDeliveryHandoffPort | null = null,
  ) {}

  async persist(
    candidate: ShadowStrategyCandidate,
    options?: { isTacticalEvent?: boolean },
  ): Promise<LiveStrategyPersistenceOutcome> {
    const isTactical = options?.isTacticalEvent ?? true;
    let alertEventId: number | null = null;
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query('SET SESSION innodb_lock_wait_timeout = 3');
        const payload = mapKernelSignalToPersistencePayload(candidate, {
          securityId: candidate.securityId,
          source: candidate.source,
          period: candidate.period,
          ruleSnapshot: candidate.ruleSnapshot,
        });
        const signal = manager.create(StrategySignal, {
          strategyDefinitionId: payload.definitionId,
          strategyVersionId: payload.versionId,
          securityId: payload.securityId,
          period: payload.period as Period,
          source: payload.source as MarketDataSource,
          signalTime: payload.signalTime,
          pivotTime: payload.pivotTime,
          signalSource: StrategySignalSource.LIVE,
          signalKind: payload.signalKind as StrategySignalKind,
          signalType: payload.signalType,
          confidence: payload.confidence,
          confidenceLevel: payload.confidenceLevel,
          decisionTrace: payload.decisionTrace,
          contextSnapshot: payload.contextSnapshot,
          ruleSnapshot: payload.ruleSnapshot,
        });
        const savedSignal = await manager.save(StrategySignal, signal);

        // 仅经战术事件汇聚层确认的有效战术买卖事件才生成告警事件，杜绝状态类插件引发通知风暴
        if (isTactical) {
          const alert = manager.create(StrategyAlertEvent, {
            strategySignalId: savedSignal.id,
            status: StrategyAlertStatus.PENDING,
            dedupeKey: liveStrategyAlertDedupeKey(candidate),
            cooldownUntil: null,
            deliveryResult: null,
            acknowledgedAt: null,
          });
          const savedAlert = await manager.save(StrategyAlertEvent, alert);
          alertEventId = savedAlert.id;
        }
      });
      // Post-commit enqueue (best-effort): the Signal/AlertEvent is already
      // committed; an enqueue failure MUST NOT fail persist. The event remains
      // PENDING for a later reconciliation sweep (dual-write window accepted).
      if (alertEventId !== null) {
        await this.enqueueDelivery(alertEventId);
      }
      return 'created';
    } catch (error) {
      if (isUniqueConstraintViolation(error, ALERT_DEDUPE_CONSTRAINT)) {
        return 'duplicate_skipped';
      }
      throw error;
    }
  }

  private async enqueueDelivery(alertEventId: number | null): Promise<void> {
    if (alertEventId === null || this.deliveryHandoff === null) return;
    try {
      await this.deliveryHandoff.publish(alertEventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to enqueue alert delivery for event ${alertEventId} ` +
          `(Signal already committed; event stays PENDING for later sweep): ${message}`,
      );
    }
  }
}

export function liveStrategyAlertDedupeKey(
  candidate: Pick<
    ShadowStrategyCandidate,
    | 'definitionId'
    | 'versionId'
    | 'securityId'
    | 'source'
    | 'period'
    | 'signalKind'
    | 'signalType'
    | 'signalTime'
  >,
): string {
  return [
    'live-v1',
    candidate.definitionId,
    candidate.versionId,
    candidate.securityId,
    candidate.source,
    candidate.period,
    candidate.signalKind,
    candidate.signalType,
    candidate.signalTime.getTime(),
  ].join(':');
}
