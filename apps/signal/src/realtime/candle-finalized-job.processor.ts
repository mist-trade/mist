import { Logger } from '@nestjs/common';
import type {
  StrategyBar,
  StrategyRealtimeMarketDataPort,
} from '@app/market-data';
import {
  CANDLE_FINALIZED_JOB_NAME,
  STRATEGY_TRIGGER_JOB_TIMEOUT_MS,
  decodeCandleFinalizedTriggerV1,
  toStrategyTrigger,
} from '@app/contracts';
import {
  RealtimePeriodBuilder,
  RealtimeKernelPool,
  REALTIME_STRATEGY_PERIODS,
  type PreMarketWarmupReport,
  type PreMarketWarmupTarget,
  type RealtimeStrategyExecutionPlan,
} from '@app/strategy';
import {
  RealtimeStrategyEvaluationService,
  type ShadowStrategyCandidate,
} from '@app/signal';
import type { SignalRegistrySnapshot } from '../signal-registry.types';
import {
  type LiveStrategyPersistenceOutcome,
  type LiveStrategyPersistenceResult,
  LiveStrategyPersistenceService,
} from './live-strategy-persistence.service';
import type { RuntimeObservabilityService } from '../observability/runtime-observability.service';
import { formatShanghaiDateString } from '@app/timezone';

export type CandleFinalizedJobOutcome =
  | 'completed'
  | 'expired_trading_day'
  | 'out_of_order_trigger_discarded';

export interface CandleFinalizedJobResult {
  readonly outcome: CandleFinalizedJobOutcome;
  readonly candidates: readonly ShadowStrategyCandidate[];
}

export class RealtimeStrategyJobDeadlineExceededError extends Error {
  readonly code = 'REALTIME_STRATEGY_JOB_DEADLINE_EXCEEDED';

  constructor(readonly stage: string) {
    super(`realtime strategy job deadline exceeded at ${stage}`);
    this.name = 'RealtimeStrategyJobDeadlineExceededError';
  }
}

interface FinalizationCursor {
  readonly timestampMs: number;
  readonly outcome: 'sealed' | 'discarded';
  readonly bar: StrategyBar | null;
}

interface PendingFinalizationCommit {
  readonly timestampMs: number;
  readonly outcome: 'sealed' | 'discarded';
  readonly bar: StrategyBar | null;
  readonly emitted: readonly StrategyBar[];
  readonly evaluatedByBar: Map<number, readonly ShadowStrategyCandidate[]>;
  readonly persistedByCandidate: Map<string, LiveStrategyPersistenceResult>;
}

export class CandleFinalizedJobProcessor {
  private readonly logger = new Logger(CandleFinalizedJobProcessor.name);
  private readonly cursors = new Map<string, FinalizationCursor>();
  private readonly pendingCommits = new Map<
    string,
    PendingFinalizationCommit
  >();
  private activeTradingDay: string | null = null;
  private lastPersistenceOutcome:
    | LiveStrategyPersistenceOutcome
    | 'failed'
    | null = null;
  private lastJobAcceptedTriggerTime: string | null = null;
  private lastJobEvaluationStarted = false;
  private lastJobEvaluated = false;
  private warmedTradingDay: string | null = null;
  private lastWarmupReport: PreMarketWarmupReport | null = null;

  constructor(
    private readonly marketData: StrategyRealtimeMarketDataPort,
    private readonly executionPlans: (
      securityId: number,
      source: 'tdx' | 'qmt',
    ) => readonly RealtimeStrategyExecutionPlan[],
    private readonly now: () => Date,
    private readonly periodBuilder = new RealtimePeriodBuilder(),
    private readonly evaluation = new RealtimeStrategyEvaluationService(
      new RealtimeKernelPool(marketData),
    ),
    private readonly jobTimeoutMs = STRATEGY_TRIGGER_JOB_TIMEOUT_MS,
    private readonly mode: 'shadow' | 'on' = 'shadow',
    private readonly persistence?: Pick<
      LiveStrategyPersistenceService,
      'persist' | 'publishGroupedDeliveries'
    > &
      Partial<Pick<LiveStrategyPersistenceService, 'persistBatch'>>,
    private readonly runtimeObservability?: Pick<
      RuntimeObservabilityService,
      'recordTradingDayRollover' | 'recordConsumerRemoval'
    >,
  ) {}

  async process(
    jobName: string,
    data: unknown,
  ): Promise<CandleFinalizedJobResult> {
    this.lastJobAcceptedTriggerTime = null;
    this.lastJobEvaluationStarted = false;
    this.lastJobEvaluated = false;
    this.lastPersistenceOutcome = null;
    const deadlineAt = this.now().getTime() + this.jobTimeoutMs;
    if (jobName !== CANDLE_FINALIZED_JOB_NAME) {
      throw new TypeError(`unsupported strategy trigger job: ${jobName}`);
    }
    const payload = decodeCandleFinalizedTriggerV1(data);
    const trigger = toStrategyTrigger(payload);
    this.assertWithinDeadline(deadlineAt, 'trading_day_validation:before');
    const tradingDay = shanghaiDay(trigger.timestamp);
    const currentDay = shanghaiDay(this.now());
    if (tradingDay < currentDay) {
      return completed('expired_trading_day');
    }
    if (tradingDay > currentDay) {
      throw new RangeError('candle_finalized triggerTime is in the future day');
    }
    this.assertWithinDeadline(deadlineAt, 'trading_day_validation:after');
    if (this.activeTradingDay !== tradingDay) {
      if (this.activeTradingDay !== null) {
        this.runtimeObservability?.recordTradingDayRollover();
      }
      this.activeTradingDay = tradingDay;
      this.cursors.clear();
      this.pendingCommits.clear();
      this.periodBuilder.reset();
      // 跨日守卫：当日已预热的组必须保留（首根封存 Bar 零历史 I/O）；
      // 仅在没有为该交易日预热的组时才清空评估态。
      if (!this.evaluation.hasGroupsWarmedFor(tradingDay)) {
        this.evaluation.reset();
      }
    }
    const executionPlans = this.executionPlans(
      trigger.securityId,
      trigger.source,
    );

    const cursorKey = `${trigger.securityId}\u0000${trigger.source}`;
    const triggerMs = trigger.timestamp.getTime();
    const prior = this.cursors.get(cursorKey);
    const pendingPrior = this.pendingCommits.get(cursorKey);
    if (
      (prior && triggerMs < prior.timestampMs) ||
      (pendingPrior && triggerMs < pendingPrior.timestampMs)
    ) {
      return completed('out_of_order_trigger_discarded');
    }

    const sealedBar =
      payload.outcome === 'sealed'
        ? await this.runStage(deadlineAt, 'redis_observation', () =>
            this.resolveSealed(trigger, payload.triggerPrice),
          )
        : null;
    if (prior && triggerMs === prior.timestampMs) {
      if (sameFinalizationIdentity(prior, trigger.outcome, sealedBar)) {
        return Object.freeze({
          outcome: 'completed',
          candidates: Object.freeze([]),
        });
      }
      throw new Error('conflicting candle finalization identity');
    }

    let pendingCommit: PendingFinalizationCommit;
    if (pendingPrior && triggerMs === pendingPrior.timestampMs) {
      if (!sameFinalizationIdentity(pendingPrior, trigger.outcome, sealedBar)) {
        throw new Error('conflicting candle finalization identity');
      }
      pendingCommit = pendingPrior;
    } else {
      const derivedPeriods = collectDerivedPeriods(
        executionPlans,
        this.evaluation,
        trigger,
      );
      const emitted = this.periodBuilder.accept(
        trigger,
        sealedBar,
        derivedPeriods,
      );
      pendingCommit = {
        timestampMs: triggerMs,
        outcome: trigger.outcome,
        bar: sealedBar,
        emitted,
        evaluatedByBar: new Map(),
        persistedByCandidate: new Map(),
      };
      this.pendingCommits.set(cursorKey, pendingCommit);
    }
    this.lastJobAcceptedTriggerTime = trigger.timestamp.toISOString();

    const candidates: ShadowStrategyCandidate[] = [];
    const indexedCandidates: {
      readonly candKey: string;
      readonly candidate: ShadowStrategyCandidate;
    }[] = [];
    for (
      let barIndex = 0;
      barIndex < pendingCommit.emitted.length;
      barIndex += 1
    ) {
      const bar = pendingCommit.emitted[barIndex];
      this.lastJobEvaluationStarted = true;
      let evaluated = pendingCommit.evaluatedByBar.get(barIndex);
      if (!evaluated) {
        evaluated = await this.runStage(deadlineAt, 'analysis_evaluation', () =>
          this.evaluation.evaluate(bar, executionPlans),
        );
        pendingCommit.evaluatedByBar.set(barIndex, evaluated);
      }
      this.lastJobEvaluated = true;

      for (let candIndex = 0; candIndex < evaluated.length; candIndex += 1) {
        const candidate = evaluated[candIndex];
        indexedCandidates.push({
          candKey: `${barIndex}:${candIndex}`,
          candidate,
        });
        candidates.push(candidate);
      }
    }

    const allResults: LiveStrategyPersistenceResult[] = [];
    if (this.mode === 'on' && indexedCandidates.length > 0) {
      if (!this.persistence) {
        throw new Error('on-mode live strategy persistence is unavailable');
      }
      const uncached = indexedCandidates.filter(
        (item) => !pendingCommit.persistedByCandidate.has(item.candKey),
      );
      if (
        uncached.length > 1 &&
        typeof this.persistence.persistBatch === 'function'
      ) {
        try {
          const batchResults = await this.runStage(
            deadlineAt,
            'persistence',
            () =>
              this.persistence!.persistBatch!(
                uncached.map((item) => item.candidate),
              ),
          );
          for (let i = 0; i < uncached.length; i += 1) {
            const result = batchResults[i];
            if (result) {
              pendingCommit.persistedByCandidate.set(
                uncached[i].candKey,
                result,
              );
              this.lastPersistenceOutcome = result.outcome;
            }
          }
        } catch (error) {
          this.lastPersistenceOutcome = 'failed';
          throw error;
        }
      } else {
        for (const item of uncached) {
          try {
            const result = await this.runStage(
              deadlineAt,
              'persistence',
              async (): Promise<LiveStrategyPersistenceResult> => {
                const persisted = await this.persistence!.persist(
                  item.candidate,
                );
                pendingCommit.persistedByCandidate.set(item.candKey, persisted);
                return persisted;
              },
            );
            this.lastPersistenceOutcome = result.outcome;
          } catch (error) {
            this.lastPersistenceOutcome = 'failed';
            throw error;
          }
        }
      }

      for (const item of indexedCandidates) {
        const persisted = pendingCommit.persistedByCandidate.get(item.candKey);
        if (persisted) {
          this.lastPersistenceOutcome = persisted.outcome;
          allResults.push(persisted);
        }
      }
    }

    this.pendingCommits.delete(cursorKey);
    this.cursors.set(cursorKey, {
      timestampMs: triggerMs,
      outcome: trigger.outcome,
      bar: sealedBar,
    });

    // Batch-grouped best-effort handoff (V2): one deliver.fanout per
    // (securityId, effectiveTime) group across all emitted timeframes;
    // failures leave events PENDING for the sweep. Must not fail the committed batch.
    if (allResults.length > 0 && this.persistence) {
      try {
        await this.persistence.publishGroupedDeliveries(allResults);
      } catch (error) {
        this.logger?.warn?.(
          `grouped delivery handoff failed (events stay PENDING): ${String(error)}`,
        );
      }
    }
    return Object.freeze({
      outcome: 'completed',
      candidates: Object.freeze(candidates),
    });
  }

  diagnostics() {
    const evaluation = this.evaluation.diagnostics();
    return Object.freeze({
      ...evaluation,
      lastOutcome: this.lastJobEvaluated ? evaluation.lastOutcome : null,
      lastPersistenceOutcome: this.lastPersistenceOutcome,
      acceptedTriggerTime: this.lastJobAcceptedTriggerTime,
      evaluationStarted: this.lastJobEvaluationStarted,
      evaluated: this.lastJobEvaluated,
    });
  }

  private async runStage<T>(
    deadlineAt: number,
    stage: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.assertWithinDeadline(deadlineAt, `${stage}:before`);
    const result = await operation();
    this.assertWithinDeadline(deadlineAt, `${stage}:after`);
    return result;
  }

  private assertWithinDeadline(deadlineAt: number, stage: string): void {
    if (this.now().getTime() >= deadlineAt) {
      throw new RealtimeStrategyJobDeadlineExceededError(stage);
    }
  }

  private async resolveSealed(
    trigger: ReturnType<typeof toStrategyTrigger>,
    triggerPrice: number,
  ) {
    const observation =
      await this.marketData.resolveRealtimeObservation(trigger);
    if (observation.outcome !== 'sealed') {
      throw new TypeError('sealed trigger resolved to a discarded observation');
    }
    if (observation.bar.close !== triggerPrice) {
      throw new Error('sealed trigger price conflicts with Redis candle close');
    }
    return observation.bar;
  }

  /**
   * 盘前预热入口（09:20 cron 与启动/reconcile 补热共用）。
   * 异常吞掉不抛出；成功后记录 warmedTradingDay 供跨日守卫使用。
   */
  async warmupRealtimeWindows(
    targets: readonly PreMarketWarmupTarget[],
    anchorAt: Date,
  ): Promise<PreMarketWarmupReport | null> {
    try {
      const report = await this.evaluation.warmup(targets, anchorAt);
      if (report) {
        this.lastWarmupReport = report;
        if (report.succeeded > 0) {
          this.warmedTradingDay = formatShanghaiDateString(anchorAt);
        }
      }
      return report;
    } catch {
      // 预热失败绝不阻塞触发主路径；开盘首根走懒加载兜底
      return null;
    }
  }

  getWarmupDiagnostics(): {
    warmedTradingDay: string | null;
    lastReport: PreMarketWarmupReport | null;
  } {
    return {
      warmedTradingDay: this.warmedTradingDay,
      lastReport: this.lastWarmupReport,
    };
  }

  reconcileRegistry(snapshot: SignalRegistrySnapshot): void {
    const before = this.runtimeObservability
      ? this.evaluation.diagnostics().groupCount
      : 0;
    const groups: Array<{
      securityId: number;
      source: 'tdx' | 'qmt';
      period: number;
    }> = [];
    for (const definition of snapshot.definitions.values()) {
      for (const source of definition.sources) {
        if (source !== 'tdx' && source !== 'qmt') continue;
        for (const securityId of definition.securityIds) {
          for (const period of definition.periods) {
            if (
              !(REALTIME_STRATEGY_PERIODS as readonly number[]).includes(period)
            )
              continue;
            groups.push({ securityId, source, period });
          }
        }
      }
    }
    this.periodBuilder.retainGroups(groups);
    this.evaluation.retainRegistryScopes(groups);
    if (this.runtimeObservability) {
      const after = this.evaluation.diagnostics().groupCount;
      this.runtimeObservability.recordConsumerRemoval(before - after);
    }
    const retainedSeries = new Set(
      groups.map((group) => `${group.securityId}\u0000${group.source}`),
    );
    for (const key of this.cursors.keys()) {
      if (!retainedSeries.has(key)) this.cursors.delete(key);
    }
    for (const key of this.pendingCommits.keys()) {
      if (!retainedSeries.has(key)) this.pendingCommits.delete(key);
    }
  }
}

function collectDerivedPeriods(
  executionPlans: readonly RealtimeStrategyExecutionPlan[],
  evaluation: RealtimeStrategyEvaluationService,
  trigger: ReturnType<typeof toStrategyTrigger>,
): Set<number> {
  // 派生周期集合 = 求值周期 ∪ context 周期（含 1440）
  const derivedPeriods = new Set<number>();
  for (const plan of executionPlans) {
    derivedPeriods.add(plan.period);
    for (const rawPeriod of Object.keys(plan.contextRequirements ?? {})) {
      derivedPeriods.add(Number(rawPeriod));
    }
  }
  // 空计划的外部标的（自身无策略）：仍按声明依赖派生周期（如 880003 的 1440），
  // 否则其日线永远派生不出来，跨组扇出也就没有 bar 可投
  if (executionPlans.length === 0) {
    for (const period of evaluation.externalPeriodsFor(
      trigger.securityId,
      trigger.source,
    )) {
      derivedPeriods.add(period);
    }
  }
  return derivedPeriods;
}

function sameFinalizationIdentity(
  cursor: Pick<FinalizationCursor, 'outcome' | 'bar'>,
  outcome: 'sealed' | 'discarded',
  sealedBar: StrategyBar | null,
): boolean {
  return (
    cursor.outcome === outcome &&
    (sealedBar === null
      ? cursor.bar === null
      : cursor.bar !== null && sameBar(cursor.bar, sealedBar))
  );
}

function sameBar(left: StrategyBar, right: StrategyBar): boolean {
  return (
    left.securityId === right.securityId &&
    left.source === right.source &&
    left.period === right.period &&
    left.timestamp.getTime() === right.timestamp.getTime() &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume &&
    left.amount === right.amount &&
    left.type === right.type
  );
}

function completed(outcome: Exclude<CandleFinalizedJobOutcome, 'completed'>) {
  return Object.freeze({ outcome, candidates: Object.freeze([]) });
}

function shanghaiDay(timestamp: Date): string {
  return formatShanghaiDateString(timestamp);
}
