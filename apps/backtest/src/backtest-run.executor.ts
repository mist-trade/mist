import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  BacktestTradeResult,
  DataSource,
  Period,
  Security,
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategySignalSource,
  StrategyVersion,
  isBacktestSource,
  type BacktestNavPoint,
  type BacktestTargetIssue,
} from '@app/shared-data';
import {
  compileStoredDefinitionVersion,
  DEFAULT_BROKER_INITIAL_CASH,
  ExecutionRiskArbiter,
  HistoricalBarSource,
  mapKernelSignalToPersistencePayload,
  PositionStateMachine,
  SimulatedBroker,
  StrategyEvaluationKernel,
  type CompiledStoredDefinition,
  type DailyNavSnapshot,
  type PositionClosedRecord,
} from '@app/strategy';
import type {
  ReplayDataSelection,
  StrategyBar,
  StrategyHistorySource,
} from '@app/market-data';
import { computePerformanceSummary } from '@app/indicators';
import { formatShanghaiDateString, isSessionCloseBar } from '@app/timezone';
import { TRADING_RULES } from '@app/constants';
import { DataSource as TypeOrmDataSource, In, Repository } from 'typeorm';

import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';
import { BacktestRunFailure } from './backtest-run-error';
import { HealthStateService } from './health/health-state.service';
import { BacktestSuiteExecutor } from './suite/backtest-suite.executor';

const BACKTEST_CALCULATION_BATCH_SIZE = 100;
const BACKTEST_RESULT_BATCH_SIZE = 100;

class ReplayBudget {
  consumed = 0;
  private lastYieldConsumed = -1;

  constructor(
    private readonly maxBars: number,
    private readonly deadlineAt: number,
  ) {}

  consume(): void {
    if (Date.now() >= this.deadlineAt) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_TIMEOUT');
    }
    this.consumed += 1;
    if (this.consumed > this.maxBars) {
      throw new BacktestRunFailure('BACKTEST_BAR_LIMIT_EXCEEDED');
    }
  }

  checkDeadline(): void {
    if (Date.now() >= this.deadlineAt) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_TIMEOUT');
    }
  }

  async checkpoint(forceYield = false): Promise<void> {
    this.checkDeadline();
    const shouldYield =
      forceYield || this.consumed % BACKTEST_CALCULATION_BATCH_SIZE === 0;
    if (!shouldYield || this.lastYieldConsumed === this.consumed) return;
    this.lastYieldConsumed = this.consumed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.checkDeadline();
  }
}

@Injectable()
export class BacktestRunExecutor {
  private readonly logger = new Logger(BacktestRunExecutor.name);

  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignalResult)
    private readonly resultRepository: Repository<BacktestSignalResult>,
    @InjectRepository(BacktestTradeResult)
    private readonly tradeRepository: Repository<BacktestTradeResult>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    private readonly marketData: BacktestMarketDataAdapter,
    private readonly dataSource: TypeOrmDataSource,
    private readonly config: ConfigService,
    private readonly health: HealthStateService,
    @Optional()
    @Inject(forwardRef(() => BacktestSuiteExecutor))
    private readonly suiteExecutor?: BacktestSuiteExecutor,
  ) {}

  async execute(runId: number): Promise<void> {
    let claimed: BacktestRun | null;
    try {
      claimed = await this.claim(runId);
    } catch (error) {
      this.health.recordRunFailed('BACKTEST_DATABASE_ERROR', 0);
      await this.failAndCleanup(runId, classifyFailure(error));
      this.logger.error(
        `Backtest run ${runId} could not be claimed`,
        errorTrace(error),
      );
      return;
    }
    if (!claimed) return;

    const startedAt = Date.now();
    try {
      if (this.suiteExecutor?.isMasterSuiteRun(claimed)) {
        await this.suiteExecutor.executeSuite(claimed, async (childRunId) => {
          await this.executeChild(childRunId);
        });
      } else {
        await this.replay(claimed);
      }
      const durationMs = Date.now() - startedAt;
      this.health.recordRunCompleted(durationMs);
      this.logger.log(
        `backtest run completed runId=${runId} durationMs=${durationMs}`,
      );
    } catch (error) {
      const failure = classifyFailure(error);
      this.health.recordRunFailed(failure.code, Date.now() - startedAt);
      await this.failAndCleanup(runId, failure);
      this.logger.error(
        `Backtest run ${runId} failed reason=${failure.code}`,
        errorTrace(error),
      );
    }
  }

  async executeChild(runId: number): Promise<void> {
    let claimed: BacktestRun | null;
    try {
      claimed = await this.claim(runId);
    } catch (error) {
      await this.failAndCleanup(runId, classifyFailure(error));
      throw error;
    }
    if (!claimed) return;
    try {
      await this.replay(claimed);
    } catch (error) {
      const failure = classifyFailure(error);
      await this.failAndCleanup(runId, failure);
      throw error;
    }
  }

  private async claim(runId: number): Promise<BacktestRun | null> {
    const result = await this.runRepository.update(
      { id: runId, status: BacktestRunStatus.PENDING },
      { status: BacktestRunStatus.RUNNING, startedAt: new Date() },
    );
    if (result.affected !== 1) return null;
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) throw new Error(`claimed backtest run ${runId} disappeared`);
    return run;
  }

  private async replay(run: BacktestRun): Promise<void> {
    if (!isBacktestSource(run.source)) {
      throw new BacktestRunFailure('BACKTEST_SOURCE_UNSUPPORTED');
    }
    if (!Array.isArray(run.targetUniverse) || run.targetUniverse.length === 0) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }

    const version = await this.versionRepository.findOne({
      where: { id: run.strategyVersionId },
    });
    if (!version) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
    if (version.ruleSchemaVersion !== StrategyRuleSchemaVersion.V1) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
    }
    const definition = await this.definitionRepository.findOne({
      where: { id: run.strategyDefinitionId },
    });
    if (!definition) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');

    // 编译边界统一收口：run.kind 仅作 DB 快照语义，回放一律透明编译为
    // decision_flow 统一计划（kernel 相位由 publicFrom 时间轴判定）。
    const compiled: CompiledStoredDefinition = compileStoredDefinitionVersion({
      kind: run.kind,
      rule: version.rule as Record<string, unknown>,
      signalKind: version.signalKind,
    });
    this.logger.log(
      `backtest plan compiled runId=${run.id} sourceKind=${compiled.sourceKind} requiredBarCount=${compiled.requiredBarCount}`,
    );

    const timeoutMs =
      this.config.get<number>('BACKTEST_RUN_TIMEOUT_MS') ?? 1_800_000;
    const maxBars =
      this.config.get<number>('BACKTEST_MAX_BARS_PER_RUN') ?? 10_000_000;
    const budget = new ReplayBudget(maxBars, Date.now() + timeoutMs);

    if (run.targetUniverse.some((code) => typeof code !== 'string')) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }
    const normalizedTargets = [
      ...new Set(run.targetUniverse.map(normalizeCode)),
    ];
    if (
      normalizedTargets.length === 0 ||
      normalizedTargets.some((code) => code.length === 0)
    ) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }
    const securities = await this.securityRepository.find({
      where: { code: In(normalizedTargets) },
    });
    const byCode = new Map(
      securities.map((security) => [security.code, security]),
    );
    const issues: BacktestTargetIssue[] = [];
    const executable: Array<{ code: string; security: Security }> = [];
    const seenSecurityIds = new Set<number>();
    for (const code of normalizedTargets) {
      if (!byCode.has(code)) {
        issues.push({ securityCode: code, code: 'SECURITY_NOT_FOUND' });
        this.health.recordTargetIssue('SECURITY_NOT_FOUND');
        this.logger.warn(
          `backtest target_issue code=SECURITY_NOT_FOUND securityCode=${code}`,
        );
        continue;
      }
      const security = byCode.get(code);
      if (!security || seenSecurityIds.has(security.id)) continue;
      seenSecurityIds.add(security.id);
      executable.push({ code, security });
    }
    if (executable.length === 0) {
      throw new BacktestRunFailure(
        'BACKTEST_NO_EXECUTABLE_TARGETS',
        'BACKTEST_NO_EXECUTABLE_TARGETS',
        undefined,
        uniqueIssues(issues),
      );
    }

    const results: BacktestSignalResult[] = [];
    const trades: BacktestTradeResult[] = [];
    const allNavHistories: (readonly DailyNavSnapshot[])[] = [];
    let signalCount = 0;
    const matchedCodes = new Set<string>();
    const prewarmActuals: number[] = [];
    for (const { code, security } of executable) {
      const outcome = await this.replaySecurity(
        run,
        compiled,
        compiled.ruleSnapshot,
        code,
        security.id,
        results,
        matchedCodes,
        budget,
        () => {
          signalCount += 1;
        },
        security.name,
      );
      if (outcome.hasBars) {
        prewarmActuals.push(outcome.prewarmActual);
      }
      if (!outcome.hasBars) {
        issues.push({ securityCode: code, code: 'NO_HISTORICAL_BARS' });
        this.health.recordTargetIssue('NO_HISTORICAL_BARS');
        this.logger.warn(
          `backtest target_issue code=NO_HISTORICAL_BARS securityCode=${code}`,
        );
      }
      for (const t of outcome.trades) {
        trades.push(
          this.tradeRepository.create({
            backtestRunId: run.id,
            securityId: t.securityId,
            securityCode: t.securityCode,
            entryTime: t.entryTime,
            exitTime: t.exitTime,
            holdingBars: t.holdingBars,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            quantity: t.quantity,
            realizedPnl: t.realizedPnl,
            returnRatio: t.returnRatio,
            exitReason: t.exitReason,
          }),
        );
      }
      if (outcome.navHistory.length > 0) {
        allNavHistories.push(outcome.navHistory);
      }
    }
    await this.flushResults(results);
    await this.flushTrades(trades);

    const { navSeries: combinedNavSeries, navPoints } =
      combineDailyNavHistories(allNavHistories, DEFAULT_BROKER_INITIAL_CASH);
    const summary = computePerformanceSummary(combinedNavSeries, trades);

    const prewarmMinActual =
      prewarmActuals.length > 0 ? Math.min(...prewarmActuals) : null;
    const prewarmMinExpected = compiled.requiredBarCount;
    const prewarmStatus =
      prewarmMinActual === null
        ? null
        : prewarmMinActual >= prewarmMinExpected
          ? 'full'
          : prewarmMinActual > 0
            ? 'partial'
            : 'empty';

    const completed = await this.runRepository.update(
      { id: run.id, status: BacktestRunStatus.RUNNING },
      {
        status: BacktestRunStatus.COMPLETED,
        targetIssues: uniqueIssues(issues),
        signalCount,
        matchedSecurityCount: matchedCodes.size,
        totalReturn: summary.totalReturn,
        annualizedReturn: summary.annualizedReturn,
        maxDrawdown: summary.maxDrawdown,
        sharpeRatio: summary.sharpeRatio,
        calmarRatio: summary.calmarRatio,
        winRate: summary.winRate,
        profitLossRatio: summary.profitLossRatio,
        tradeCount: summary.tradeCount,
        navSeries: navPoints,
        prewarmStatus,
        prewarmMinActual,
        prewarmMinExpected,
        completedAt: new Date(),
        errorMessage: null,
      },
    );
    if (completed.affected !== 1) {
      throw new BacktestRunFailure('BACKTEST_DATABASE_ERROR');
    }
  }

  private async replaySecurity(
    run: BacktestRun,
    compiled: CompiledStoredDefinition,
    ruleSnapshot: Readonly<Record<string, unknown>>,
    securityCode: string,
    securityId: number,
    results: BacktestSignalResult[],
    matchedCodes: Set<string>,
    budget: ReplayBudget,
    onSignal: () => void,
    securityName?: string,
  ): Promise<{
    hasBars: boolean;
    prewarmStatus: 'full' | 'partial' | 'empty';
    prewarmActual: number;
    trades: readonly PositionClosedRecord[];
    navHistory: readonly DailyNavSnapshot[];
  }> {
    const preWarmEndAt = replayStartFor(run);
    const kernel = new StrategyEvaluationKernel({
      securityId,
      securityCode,
      publicFrom: run.startDate,
      plans: [
        {
          definitionId: run.strategyDefinitionId,
          versionId: run.strategyVersionId,
          flow: compiled.flow,
          ruleSnapshot,
          period: run.period,
          requiredBarCount: compiled.requiredBarCount,
          contextRequirements: compiled.contextRequirements,
        },
      ],
    });
    const selection: ReplayDataSelection =
      run.source === DataSource.CANONICAL
        ? { kind: 'canonical' }
        : {
            kind: 'provider',
            source: run.source as StrategyHistorySource,
          };
    const source = new HistoricalBarSource(this.marketData, {
      securityId,
      securityCode,
      selection,
      evaluationPeriod: run.period,
      contextPeriods: compiled.contextRequirements,
      preWarmEndAt,
      publicFrom: run.startDate,
      endAt: new Date(run.endDate.getTime()),
      requiredBars: compiled.requiredBarCount,
    });

    const broker = new SimulatedBroker(DEFAULT_BROKER_INITIAL_CASH);
    broker.registerSecurity(securityCode, { name: securityName });
    const positionMachine = new PositionStateMachine(
      securityId,
      securityCode,
      DEFAULT_BROKER_INITIAL_CASH,
    );
    const arbiter = new ExecutionRiskArbiter({
      hardStopLossRatio: -0.08,
      defaultCooldownBars: 3,
      cashAllocationRatio: 0.995,
      lotSize: TRADING_RULES.MAIN_BOARD_LOT_SIZE,
    });
    let lastSeenBar: StrategyBar | null = null;

    const outcome = await source.drive(
      kernel,
      async (signal, bar) => {
        budget.consume();
        const payload = mapKernelSignalToPersistencePayload(signal, {
          securityId,
          securityCode,
          source: bar.source as unknown as DataSource,
          period: run.period,
          ruleSnapshot,
        });
        results.push(
          this.resultRepository.create({
            backtestRunId: run.id,
            securityId: payload.securityId,
            strategyDefinitionId: payload.definitionId,
            strategyVersionId: payload.versionId,
            securityCode: payload.securityCode ?? securityCode,
            period: payload.period as Period,
            source: payload.source as DataSource,
            signalTime: payload.signalTime,
            pivotTime: payload.pivotTime,
            signalType: payload.signalType,
            signalKind: payload.signalKind as StrategySignalKind,
            signalSource: StrategySignalSource.BACKTEST,
            confidence: payload.confidence,
            confidenceLevel: payload.confidenceLevel,
            decisionTrace: payload.decisionTrace,
            contextSnapshot: payload.contextSnapshot,
            ruleSnapshot: payload.ruleSnapshot,
          }),
        );
        matchedCodes.add(securityCode);
        onSignal();

        const orderDraft = arbiter.arbitrate({
          bar,
          signal,
          position: positionMachine.getSnapshot(),
          availableCash: positionMachine.getCash(),
        });
        if (
          orderDraft &&
          !broker.getOpenOrders().some((o) => o.securityCode === securityCode)
        ) {
          broker.submitOrder(orderDraft);
        }

        if (results.length >= BACKTEST_RESULT_BATCH_SIZE)
          await this.flushResults(results);
      },
      async (bar) => {
        budget.consume();
        lastSeenBar = bar;

        const fills = broker.onBar(bar);
        for (const fill of fills) {
          positionMachine.onOrderFilled(fill);
        }

        positionMachine.onBar(bar);

        const riskOrderDraft = arbiter.arbitrate({
          bar,
          position: positionMachine.getSnapshot(),
          availableCash: positionMachine.getCash(),
        });
        if (
          riskOrderDraft &&
          !broker.getOpenOrders().some((o) => o.securityCode === securityCode)
        ) {
          broker.submitOrder(riskOrderDraft);
        }

        if (isSessionCloseBar(bar.timestamp, run.period)) {
          const dateStr = formatShanghaiDateString(bar.timestamp);
          positionMachine.onDayClose(bar);
          broker.settleDayClose(dateStr);
        }

        await budget.checkpoint();
      },
      async () => {
        // 预算计全部推送 bar（含 context 周期与预热段）——多周期合并流按预期加速消耗
        budget.consume();
      },
    );
    await budget.checkpoint(true);

    const finalBar = lastSeenBar as StrategyBar | null;
    if (finalBar && positionMachine.getNavHistory().length === 0) {
      const dateStr = formatShanghaiDateString(finalBar.timestamp);
      positionMachine.onDayClose(finalBar);
      broker.settleDayClose(dateStr);
    }

    return {
      hasBars: outcome.publicBarCount > 0,
      prewarmStatus: outcome.prewarmStatus,
      prewarmActual: outcome.prewarmActual,
      trades: positionMachine.getClosedTrades(),
      navHistory: positionMachine.getNavHistory(),
    };
  }

  private async flushResults(results: BacktestSignalResult[]): Promise<void> {
    if (results.length === 0) return;
    const pending = results.splice(0, results.length);
    const startedAt = Date.now();
    // TypeORM's JSON DeepPartial type rejects Record<string, unknown> even
    // though it is the entity's declared JSON boundary; keep this cast local
    // to the batch writer rather than weakening the entity contract.
    try {
      await this.resultRepository.insert(
        pending.map((result) => ({
          backtestRunId: result.backtestRunId,
          securityId: result.securityId,
          strategyDefinitionId: result.strategyDefinitionId,
          strategyVersionId: result.strategyVersionId,
          securityCode: result.securityCode,
          period: result.period,
          source: result.source,
          signalTime: result.signalTime,
          pivotTime: result.pivotTime,
          signalType: result.signalType,
          signalKind: result.signalKind,
          signalSource: result.signalSource,
          confidence: result.confidence,
          confidenceLevel: result.confidenceLevel,
          decisionTrace: result.decisionTrace,
          contextSnapshot: result.contextSnapshot,
          ruleSnapshot: result.ruleSnapshot,
        })) as never,
      );
      this.health.recordResultBatch(pending.length, Date.now() - startedAt);
    } catch (error) {
      this.health.recordResultBatchFailure(Date.now() - startedAt);
      this.logger.error(
        `backtest persistence_batch_failed runId=${pending[0]?.backtestRunId}`,
      );
      throw error;
    }
  }

  private async flushTrades(trades: BacktestTradeResult[]): Promise<void> {
    if (trades.length === 0) return;
    const pending = trades.splice(0, trades.length);
    try {
      await this.tradeRepository.insert(
        pending.map((t) => ({
          backtestRunId: t.backtestRunId,
          securityId: t.securityId,
          securityCode: t.securityCode,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          holdingBars: t.holdingBars,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          realizedPnl: t.realizedPnl,
          returnRatio: t.returnRatio,
          exitReason: t.exitReason,
        })) as never,
      );
    } catch (error) {
      this.logger.error(
        `backtest trades_batch_failed runId=${pending[0]?.backtestRunId}`,
      );
      throw error;
    }
  }

  private async failAndCleanup(
    runId: number,
    failure: BacktestRunFailure,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const update = {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: failure.code,
          ...(failure.targetIssues
            ? { targetIssues: uniqueIssues(failure.targetIssues) }
            : {}),
        };
        const updated = await manager.update(
          BacktestRun,
          {
            id: runId,
            status: In([BacktestRunStatus.PENDING, BacktestRunStatus.RUNNING]),
          },
          update,
        );
        if (updated.affected !== 1) return;
        await manager.delete(BacktestSignalResult, { backtestRunId: runId });
        await manager.delete(BacktestTradeResult, { backtestRunId: runId });
      });
    } catch (error) {
      this.logger.error(
        `Backtest cleanup failed for ${runId}`,
        errorTrace(error),
      );
    }
  }
}

function normalizeCode(value: string): string {
  return value.trim();
}

function uniqueIssues(
  issues: readonly BacktestTargetIssue[],
): BacktestTargetIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.securityCode}\u0000${issue.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replayStartFor(run: BacktestRun): Date {
  return new Date(run.startDate.getTime());
}

function classifyFailure(error: unknown): BacktestRunFailure {
  if (error instanceof BacktestRunFailure) return error;
  return new BacktestRunFailure(
    'BACKTEST_DATABASE_ERROR',
    'BACKTEST_DATABASE_ERROR',
    error,
  );
}

function errorTrace(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function combineDailyNavHistories(
  allNavHistories: readonly (readonly DailyNavSnapshot[])[],
  initialCashPerSecurity: number,
): { navSeries: number[]; navPoints: BacktestNavPoint[] } {
  if (allNavHistories.length === 0) {
    return { navSeries: [], navPoints: [] };
  }
  if (allNavHistories.length === 1) {
    const points: BacktestNavPoint[] = allNavHistories[0].map((s) => ({
      date: s.date,
      totalEquity: s.totalEquity,
      cash: s.cash,
      marketValue: s.marketValue,
    }));
    return {
      navSeries: allNavHistories[0].map((s) => s.totalEquity),
      navPoints: points,
    };
  }

  const dateSet = new Set<string>();
  for (const history of allNavHistories) {
    for (const item of history) {
      dateSet.add(item.date);
    }
  }
  const sortedDates = Array.from(dateSet).sort();

  const dateMaps = allNavHistories.map((history) => {
    const map = new Map<string, DailyNavSnapshot>();
    for (const item of history) {
      map.set(item.date, item);
    }
    return map;
  });

  const lastKnownEquities = new Array(allNavHistories.length).fill(
    initialCashPerSecurity,
  );
  const lastKnownCash = new Array(allNavHistories.length).fill(
    initialCashPerSecurity,
  );
  const lastKnownMarketValue = new Array(allNavHistories.length).fill(0);

  const navSeries: number[] = [];
  const navPoints: BacktestNavPoint[] = [];
  for (const date of sortedDates) {
    let dayTotalEquity = 0;
    let dayCash = 0;
    let dayMarketValue = 0;
    for (let i = 0; i < allNavHistories.length; i++) {
      const snap = dateMaps[i].get(date);
      if (snap) {
        lastKnownEquities[i] = snap.totalEquity;
        lastKnownCash[i] = snap.cash;
        lastKnownMarketValue[i] = snap.marketValue;
      }
      dayTotalEquity += lastKnownEquities[i];
      dayCash += lastKnownCash[i];
      dayMarketValue += lastKnownMarketValue[i];
    }
    const roundedEquity = Math.round(dayTotalEquity * 100) / 100;
    const roundedCash = Math.round(dayCash * 100) / 100;
    const roundedMarketValue = Math.round(dayMarketValue * 100) / 100;
    navSeries.push(roundedEquity);
    navPoints.push({
      date,
      totalEquity: roundedEquity,
      cash: roundedCash,
      marketValue: roundedMarketValue,
    });
  }

  return { navSeries, navPoints };
}
