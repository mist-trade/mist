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
import {
  groupSignals,
  mapKernelSignalToPersistencePayload,
} from '@app/strategy';
import { DataSource as TypeOrmDataSource, type EntityManager } from 'typeorm';
import {
  STRATEGY_ALERT_DELIVERY_HANDOFF_PORT,
  type StrategyAlertDeliveryHandoffPort,
} from './notification/strategy-alert-delivery-handoff.port';

export type LiveStrategyPersistenceOutcome = 'created' | 'duplicate_skipped';

export interface LiveStrategyPersistenceResult {
  readonly outcome: LiveStrategyPersistenceOutcome;
  /** AlertEvent id when a new row was created; null on duplicate_skipped. */
  readonly alertEventId: number | null;
  /** The candidate this result belongs to (identity for batch grouping). */
  readonly candidate: ShadowStrategyCandidate;
}

const ALERT_DEDUPE_CONSTRAINT = 'uq_strategy_alert_events_dedupe_key';
const INNODB_LOCK_WAIT_TIMEOUT_SQL = 'SET SESSION innodb_lock_wait_timeout = 3';
const SAVEPOINT_PREFIX = 'sp_candidate_';
const OUTCOME_CREATED = 'created';
const OUTCOME_DUPLICATE_SKIPPED = 'duplicate_skipped';

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
  ): Promise<LiveStrategyPersistenceResult> {
    let alertEventId: number | null = null;
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.query(INNODB_LOCK_WAIT_TIMEOUT_SQL);
        alertEventId = await this.insertSignalAndAlert(manager, candidate);
      });
      return {
        outcome: OUTCOME_CREATED,
        alertEventId,
        candidate,
      };
    } catch (error) {
      if (isUniqueConstraintViolation(error, ALERT_DEDUPE_CONSTRAINT)) {
        return {
          outcome: OUTCOME_DUPLICATE_SKIPPED,
          alertEventId: null,
          candidate,
        };
      }
      throw error;
    }
  }

  /**
   * Batch persistence for candidates sharing one 1m trigger: opens a single
   * transaction with one `SET SESSION innodb_lock_wait_timeout = 3` and guards
   * each candidate with a savepoint so duplicate-key conflicts roll back only
   * that candidate's signal row without failing sibling candidates.
   */
  async persistBatch(
    candidates: readonly ShadowStrategyCandidate[],
  ): Promise<LiveStrategyPersistenceResult[]> {
    if (candidates.length === 0) return [];
    if (candidates.length === 1) {
      return [await this.persist(candidates[0])];
    }

    return await this.dataSource.transaction(async (manager) => {
      await manager.query(INNODB_LOCK_WAIT_TIMEOUT_SQL);
      const results: LiveStrategyPersistenceResult[] = [];
      for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i];
        const savepoint = `${SAVEPOINT_PREFIX}${i}`;
        await manager.query(`SAVEPOINT ${savepoint}`);
        try {
          const alertEventId = await this.insertSignalAndAlert(
            manager,
            candidate,
          );
          await manager.query(`RELEASE SAVEPOINT ${savepoint}`);
          results.push({
            outcome: OUTCOME_CREATED,
            alertEventId,
            candidate,
          });
        } catch (error) {
          if (isUniqueConstraintViolation(error, ALERT_DEDUPE_CONSTRAINT)) {
            await manager.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
            await manager.query(`RELEASE SAVEPOINT ${savepoint}`);
            results.push({
              outcome: OUTCOME_DUPLICATE_SKIPPED,
              alertEventId: null,
              candidate,
            });
            continue;
          }
          throw error;
        }
      }
      return results;
    });
  }

  private async insertSignalAndAlert(
    manager: EntityManager,
    candidate: ShadowStrategyCandidate,
  ): Promise<number> {
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
      decisionTrace: payload.decisionTrace,
      contextSnapshot: payload.contextSnapshot,
      ruleSnapshot: payload.ruleSnapshot,
    });
    const savedSignal = await manager.save(StrategySignal, signal);

    const alert = manager.create(StrategyAlertEvent, {
      strategySignalId: savedSignal.id,
      status: StrategyAlertStatus.PENDING,
      dedupeKey: liveStrategyAlertDedupeKey(candidate),
      deliveryResult: null,
    });
    const savedAlert = await manager.save(StrategyAlertEvent, alert);
    return savedAlert.id;
  }

  /**
   * Batch-grouped delivery handoff (V2, 2026-11-24 定稿，决策文档 7.1.3):
   * group the batch's created AlertEvents by (securityId, effectiveTime) computed
   * from the candidate signals and enqueue ONE deliver.fanout job per group. The
   * group is complete at commit time (same 1m trigger => same processor batch), so
   * no timer/lateness handling is needed. Best-effort: an enqueue failure MUST NOT
   * fail the processor run — the Signal/AlertEvent rows are already committed and
   * the events stay PENDING for the pending-alert sweep.
   * 分组经由共享纯域函数 groupSignals（REQ-FACADE-03：与门面同一实现）。
   */
  async publishGroupedDeliveries(
    results: readonly LiveStrategyPersistenceResult[],
  ): Promise<void> {
    if (this.deliveryHandoff === null) return;
    const created = results.filter((r) => r.alertEventId !== null);
    if (created.length === 0) return;

    const groups = groupSignals(created, (result) => result.candidate);

    for (const { descriptor, members } of groups.values()) {
      const ids = members.map((member) => member.alertEventId as number);
      try {
        await this.deliveryHandoff.publishGroup(
          {
            securityId: descriptor.securityId,
            effectiveTime: descriptor.effectiveTime.toISOString(),
            tradingDay: descriptor.tradingDay,
          },
          ids,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to enqueue grouped alert delivery for securityId=${descriptor.securityId} ` +
            `effectiveTime=${descriptor.effectiveTime.toISOString()} events=[${ids.join(',')}] ` +
            `(rows already committed; events stay PENDING for later sweep): ${message}`,
        );
      }
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
