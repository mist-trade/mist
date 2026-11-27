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
  buildOfflineSignalIdempotencyKey,
  CapitalLedger,
  compileStoredDefinitionVersion,
  createDefaultRiskRules,
  DEFAULT_BROKER_INITIAL_CASH,
  ExternalFactorPluginLoader,
  HistoricalBarSource,
  mapKernelSignalToPersistencePayload,
  ORDER_STATUSES,
  ORDER_TYPES,
  PositionStateMachine,
  SimulatedBroker,
  StrategyEvaluationKernel,
  TradingEngine,
  renderTraceChainOf,
  shanghaiMidnight,
  yuanToLi,
  type AccountSnapshot,
  type CompiledStoredDefinition,
  type DailyNavSnapshot,
  type KernelSignal,
  type PositionClosedRecord,
  type SignalGroupInput,
  type TradingPositionState,
} from '@app/strategy';
import type {
  ReplayDataSelection,
  StrategyBar,
  StrategyHistorySource,
} from '@app/market-data';
import {
  computePerformanceSummary,
  computePortfolioSharpeRatio,
  computeUnderwaterDuration,
  type PortfolioSharpeInput,
} from '@app/indicators';
import { formatShanghaiDateString, isSessionCloseBar } from '@app/timezone';
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
    const sortedDates = collectSortedDates(allNavHistories);
    const { navSeries: combinedNavSeries, navPoints } =
      combineDailyNavHistories(allNavHistories, DEFAULT_BROKER_INITIAL_CASH);
    // 必须在 flushTrades 通过 splice 清空 trades 数组前计算绩效汇总，传入只读快照
    const closedTradesSnapshot: readonly BacktestTradeResult[] = [...trades];
    const summary = computePerformanceSummary(
      combinedNavSeries,
      closedTradesSnapshot,
    );
    // sharpe_ratio 统一等权组合（协方差口径）估计量：单标的 N=1 与原单序列
    // 夏普逐位一致（equity 环比 + 丢首行同构构造），多标的按日期轴对齐等权
    // 平均（缺失日 0 = 持现金）。
    const sharpeRatio = computePortfolioSharpeRatio(
      alignEquityReturns(allNavHistories, sortedDates),
    );
    const maxUnderwaterDuration = computeUnderwaterDuration(combinedNavSeries);

    await this.flushResults(results);
    await this.flushTrades(trades);

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
        sharpeRatio,
        calmarRatio: summary.calmarRatio,
        winRate: summary.winRate,
        profitLossRatio: summary.profitLossRatio,
        tradeCount: summary.tradeCount,
        maxUnderwaterDuration,
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
      virtualExitPolicy:
        ExternalFactorPluginLoader.createVirtualExitPolicy() ?? undefined,
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

    // 首日涨跌停基准：回放起点前一交易日收盘（日线标签边界截断，与预热同构）。
    // 无前置 bar 时保持 broker 的 bar.open 回退，不造数。
    const preCloseWindow = await this.marketData.loadReplayWindow({
      securityId,
      securityCode,
      selection,
      period: 1440,
      endAt: shanghaiMidnight(preWarmEndAt),
      requiredBars: 1,
    });
    const preCloseBar = preCloseWindow.bars.at(-1);

    const broker = new SimulatedBroker(DEFAULT_BROKER_INITIAL_CASH);
    broker.registerSecurity(securityCode, {
      name: securityName,
      ...(preCloseBar ? { preClose: preCloseBar.close } : {}),
    });
    const positionMachine = new PositionStateMachine(securityId, securityCode);
    const capitalLedger = new CapitalLedger({
      initialCash: DEFAULT_BROKER_INITIAL_CASH,
    });
    // 交易层统一引擎（组4 迁移）：裁决/仓位出自同一管线。2026-11-25 拍板后
    // 引擎风控仅 systemicCrunch 常驻；硬止损由策略定义声明（DSL params →
    // PriceDefenseExitPlugin → 信号层 exit 信号），预算比例统一 0.95。
    const tradingEngine = new TradingEngine({
      riskRules: createDefaultRiskRules(),
    });
    // 信号按 Bar 缓冲成组：drive 序为 push → onBar(T) → onSignal(T)，组内信号在
    // 下一根 Bar 开始时统一 engine.decide（持仓/现金快照 = 前一 Bar 收盘后状态，
    // 指令交 Broker 于本 Bar Next-Bar 撮合——与旧"逐信号即时裁决"时序等价）。
    const pendingSignals: { signal: KernelSignal }[] = [];

    const buildAccountSnapshot = (): AccountSnapshot => {
      const snap = positionMachine.getSnapshot();
      const positions = new Map<number, TradingPositionState>();
      if (snap.holdingQuantity > 0) {
        positions.set(securityId, {
          securityId,
          securityCode,
          holdingQuantity: snap.holdingQuantity,
          costPriceLi: yuanToLi(snap.costPrice),
          entryTime: snap.entryTime,
          currentPriceLi: yuanToLi(snap.currentPrice),
          realizedPnlLi: yuanToLi(snap.realizedPnl),
        });
      }
      return {
        cashLi: yuanToLi(capitalLedger.getCash()),
        positions,
        tradingDay: formatShanghaiDateString(
          (lastSeenBar as StrategyBar | null)?.timestamp ?? new Date(0),
        ),
      };
    };

    const submitInstruction = (
      instruction: {
        readonly action: 'BUY' | 'SELL';
        readonly quantity: number;
        readonly reason: string;
        readonly idempotencyKey: string;
      },
      signalTime: Date,
    ): void => {
      broker.submitOrder({
        securityId,
        securityCode,
        side: instruction.action,
        orderType: ORDER_TYPES.MARKET,
        quantity: instruction.quantity,
        signalTime,
        ...(instruction.action === 'BUY'
          ? { entryReason: instruction.reason }
          : { exitReason: instruction.reason }),
        intentId: instruction.idempotencyKey,
      });
    };

    const flushPendingGroup = (): void => {
      if (pendingSignals.length === 0) return;
      const first = pendingSignals[0]!.signal;
      const seenKeys = new Map<string, number>();
      const group: SignalGroupInput = {
        securityId,
        securityCode,
        effectiveTime: first.signalTime,
        tradingDay: formatShanghaiDateString(first.signalTime),
        signals: pendingSignals.map(({ signal }) => {
          const baseKey = buildOfflineSignalIdempotencyKey(signal, run.period);
          const count = (seenKeys.get(baseKey) ?? 0) + 1;
          seenKeys.set(baseKey, count);
          const idempotencyKey = count === 1 ? baseKey : `${baseKey}-${count}`;
          return {
            // 离线合成幂等锚点（与门面离线 scheme 一致，design 3.1）
            idempotencyKey,
            signal,
            attribution: {
              strategyName: `definition-${run.strategyDefinitionId}`,
              periodLabel: `${run.period}m`,
              traceChain: renderTraceChainOf(signal.decisionTrace),
            },
          };
        }),
      };
      pendingSignals.length = 0;

      // 既有在途挂单（如上一周期一字跌停顺延的 BLOCKED 卖单）——不叠加新指令
      if (
        broker
          .getOpenOrders()
          .some(
            (o) =>
              o.securityCode === securityCode &&
              o.status === ORDER_STATUSES.BLOCKED,
          )
      ) {
        return;
      }

      const decision = tradingEngine.decide(group, buildAccountSnapshot());
      for (const instruction of decision.instructions) {
        if (!instruction.signal) continue;
        submitInstruction(instruction, instruction.signal.signalTime);
      }
    };

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
            decisionTrace: payload.decisionTrace,
            contextSnapshot: payload.contextSnapshot,
            ruleSnapshot: payload.ruleSnapshot,
          }),
        );
        matchedCodes.add(securityCode);
        onSignal();

        // 信号入组缓冲，下一根 Bar 开始时统一经交易层引擎裁决（先出后进）
        pendingSignals.push({ signal });
        if (results.length >= BACKTEST_RESULT_BATCH_SIZE)
          await this.flushResults(results);
      },
      async (bar) => {
        budget.consume();
        lastSeenBar = bar;

        // 1) 上一 Bar 信号组统一裁决 → 指令入待撮合队列（本 Bar Next-Bar 撮合）
        flushPendingGroup();

        // 2) 撮合 + 记账（SimulatedBroker 撮合语义零改动）
        const fills = broker.onBar(bar);
        for (const fill of fills) {
          positionMachine.onOrderFilled(fill);
          capitalLedger.applyFill(fill);
        }

        positionMachine.onBar(bar);

        // 3) per-bar 风控巡检（systemicCrunch → hardStop），保护性清仓指令
        const snap = positionMachine.getSnapshot();
        if (snap.holdingQuantity > 0) {
          const riskInstructions = tradingEngine.surveilBar(
            {
              securityId,
              securityCode,
              timestamp: bar.timestamp,
              close: bar.close,
            },
            {
              securityId,
              securityCode,
              holdingQuantity: snap.holdingQuantity,
              costPriceLi: yuanToLi(snap.costPrice),
              entryTime: snap.entryTime,
              currentPriceLi: yuanToLi(snap.currentPrice),
              realizedPnlLi: yuanToLi(snap.realizedPnl),
            },
          );
          for (const instruction of riskInstructions) {
            if (
              broker
                .getOpenOrders()
                .some((o) => o.securityCode === securityCode)
            ) {
              continue; // 既有挂单在途（如当前 Bar 刚由信号下单或跌停顺延），不叠加风控单
            }
            submitInstruction(instruction, bar.timestamp);
          }
        }

        if (isSessionCloseBar(bar.timestamp, run.period)) {
          const dateStr = formatShanghaiDateString(bar.timestamp);
          capitalLedger.onDayClose(bar, positionMachine.getSnapshot());
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

    // 回放末尾残余信号组补flush（指令入队后无后续 Bar 撮合——与旧路径一致不成交）
    flushPendingGroup();

    const finalBar = lastSeenBar as StrategyBar | null;
    if (finalBar && capitalLedger.getNavHistory().length === 0) {
      const dateStr = formatShanghaiDateString(finalBar.timestamp);
      capitalLedger.onDayClose(finalBar, positionMachine.getSnapshot());
      broker.settleDayClose(dateStr);
    }

    return {
      hasBars: outcome.publicBarCount > 0,
      prewarmStatus: outcome.prewarmStatus,
      prewarmActual: outcome.prewarmActual,
      trades: positionMachine.getClosedTrades(),
      navHistory: capitalLedger.getNavHistory(),
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

/**
 * 汇总全部标的 NAV 快照出现的交易日（去重升序）。
 * combineDailyNavHistories 与 alignDailyReturns 共用同一日期轴。
 */
export function collectSortedDates(
  allNavHistories: readonly (readonly DailyNavSnapshot[])[],
): string[] {
  const dateSet = new Set<string>();
  for (const history of allNavHistories) {
    for (const item of history) {
      dateSet.add(item.date);
    }
  }
  return Array.from(dateSet).sort();
}

/**
 * 将各标的逐日盯市权益按统一日期轴派生环比收益，并丢弃首行（建仓期无收益
 * 语义）。估计量与单标的 computeDailyReturns(navSeries) 同构：N=1 且无缺失
 * 日时与现有单序列夏普逐位一致。
 *
 * 语义：快照间缺失日权益 fill-forward 不变 → 环比 0（子账户持现金）；
 * 首个快照前视为未开始 → 环比 0；首行丢弃与单标的 NAV 环比（begIndex=1）
 * 对齐。
 */
export function alignEquityReturns(
  allNavHistories: readonly (readonly DailyNavSnapshot[])[],
  sortedDates: readonly string[],
): PortfolioSharpeInput[] {
  const aligned: PortfolioSharpeInput[] = [];
  for (const history of allNavHistories) {
    if (history.length === 0) continue;
    const equityByDate = new Map<string, number>();
    for (const item of history) {
      equityByDate.set(item.date, item.totalEquity);
    }
    const returns: number[] = [];
    let prevEquity: number | undefined = undefined;
    for (const date of sortedDates) {
      const equity = equityByDate.get(date);
      if (equity === undefined) {
        // 缺失日：权益 fill-forward 不变（持现金），环比 0
        returns.push(0);
        continue;
      }
      returns.push(
        prevEquity !== undefined && prevEquity > 0
          ? (equity - prevEquity) / prevEquity
          : 0, // 首个快照无前值（建仓期），与状态机首日 dailyReturn=0 一致
      );
      prevEquity = equity;
    }
    aligned.push({
      securityCode: history[0].securityCode,
      returns: returns.slice(1),
    });
  }
  return aligned;
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

  const sortedDates = collectSortedDates(allNavHistories);

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
