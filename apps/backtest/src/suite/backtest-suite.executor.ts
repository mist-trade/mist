import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestTradeResult,
  type BacktestTargetIssue,
} from '@app/shared-data';
import {
  DEFAULT_BROKER_INITIAL_CASH,
  getPresetStressScenario,
  listPresetStressScenarios,
  StressTestingSuiteOrchestrator,
  WalkForwardOrchestrator,
  type StressScenarioDefinition,
  type WfaReport,
  type WfaSliceOptions,
  type WfaWindowType,
  type StressTestSuiteReport,
} from '@app/strategy';
import type { ClosedTradeInput } from '@app/indicators';
import { BacktestRunExecutor } from '../backtest-run.executor';

export type ChildRunExecutorFn = (runId: number) => Promise<void>;

const MIN_CAPITAL_TARGET_COUNT = 1;

@Injectable()
export class BacktestSuiteExecutor {
  private readonly logger = new Logger(BacktestSuiteExecutor.name);

  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestTradeResult)
    private readonly tradeRepository: Repository<BacktestTradeResult>,
    @Optional()
    @Inject(forwardRef(() => BacktestRunExecutor))
    private readonly runExecutor?: BacktestRunExecutor,
  ) {}

  /**
   * 判断指定 BacktestRun 是否属于套件主运行 (Master Run)
   */
  isMasterSuiteRun(run: BacktestRun): boolean {
    if (run.parentRunId) return false;
    return run.scenarioId === 'WFA' || run.scenarioId === 'STRESS_SUITE';
  }

  /**
   * 调度执行回测套件主任务
   */
  async executeSuite(
    masterRun: BacktestRun,
    runSingle?: ChildRunExecutorFn,
  ): Promise<void> {
    if (masterRun.scenarioId === 'WFA') {
      await this.executeWfaSuite(masterRun, runSingle);
    } else if (masterRun.scenarioId === 'STRESS_SUITE') {
      await this.executeStressSuite(masterRun, runSingle);
    } else {
      throw new Error(`Unsupported suite scenarioId: ${masterRun.scenarioId}`);
    }
  }

  /**
   * 调度执行 WFA 滚动前向回测套件
   */
  async executeWfaSuite(
    masterRun: BacktestRun,
    runSingle?: ChildRunExecutorFn,
  ): Promise<WfaReport> {
    this.logger.log(
      `Starting WFA suite execution masterRunId=${masterRun.id} suiteId=${masterRun.suiteId}`,
    );

    const executeChild = runSingle ?? ((id) => this.runChildDirectly(id));

    try {
      const wfaContext = (masterRun.contextSnapshot?.wfaOptions ??
        {}) as Partial<WfaSliceOptions>;
      const windowType: WfaWindowType =
        wfaContext.windowType === 'anchored' ? 'anchored' : 'rolling';
      const trainDurationMonths = wfaContext.trainDurationMonths ?? 12;
      const testDurationMonths = wfaContext.testDurationMonths ?? 3;
      const stepDurationMonths =
        wfaContext.stepDurationMonths ?? testDurationMonths;

      const sliceOptions: WfaSliceOptions = {
        startDate: masterRun.startDate,
        endDate: masterRun.endDate,
        windowType,
        trainDurationMonths,
        testDurationMonths,
        stepDurationMonths,
      };

      const orchestrator = new WalkForwardOrchestrator();
      const normalizedUniverse = normalizeTargetUniverse(
        masterRun.targetUniverse,
      );
      const suiteInitialCapital = resolvePortfolioInitialCash(
        normalizedUniverse.length,
      );

      const report = await orchestrator.execute({
        suiteId: masterRun.suiteId ?? `wfa-${masterRun.id}`,
        sliceOptions,
        initialCapital: suiteInitialCapital,
        runner: async (fold) => {
          this.logger.log(
            `WFA Fold ${fold.foldIndex}: Train [${fold.trainStartDate} ~ ${fold.trainEndDate}], Test [${fold.testStartDate} ~ ${fold.testEndDate}]`,
          );

          // 1. 创建训练集子 Run
          const trainRun = await this.runRepository.save(
            this.runRepository.create({
              strategyDefinitionId: masterRun.strategyDefinitionId,
              strategyVersionId: masterRun.strategyVersionId,
              targetUniverse: masterRun.targetUniverse,
              targetIssues: [],
              period: masterRun.period,
              source: masterRun.source,
              startDate: new Date(fold.trainStartDate),
              endDate: new Date(fold.trainEndDate),
              status: BacktestRunStatus.PENDING,
              kind: masterRun.kind,
              parentRunId: masterRun.id,
              suiteId: masterRun.suiteId,
              stage: 'TRAIN',
              scenarioId: `FOLD_${fold.foldIndex}_TRAIN`,
            }),
          );
          await executeChild(trainRun.id);
          const completedTrain = await this.runRepository.findOne({
            where: { id: trainRun.id },
          });

          // 2. 创建测试集子 Run
          const testRun = await this.runRepository.save(
            this.runRepository.create({
              strategyDefinitionId: masterRun.strategyDefinitionId,
              strategyVersionId: masterRun.strategyVersionId,
              targetUniverse: masterRun.targetUniverse,
              targetIssues: [],
              period: masterRun.period,
              source: masterRun.source,
              startDate: new Date(fold.testStartDate),
              endDate: new Date(fold.testEndDate),
              status: BacktestRunStatus.PENDING,
              kind: masterRun.kind,
              parentRunId: masterRun.id,
              suiteId: masterRun.suiteId,
              stage: 'TEST',
              scenarioId: `FOLD_${fold.foldIndex}_TEST`,
            }),
          );
          await executeChild(testRun.id);
          const completedTest = await this.runRepository.findOne({
            where: { id: testRun.id },
          });

          const testTrades = await this.tradeRepository.find({
            where: { backtestRunId: testRun.id },
          });

          return {
            trainRunId: trainRun.id,
            testRunId: testRun.id,
            trainSharpe: Number(completedTrain?.sharpeRatio ?? 0),
            testSharpe: Number(completedTest?.sharpeRatio ?? 0),
            testNavSeries: completedTest?.navSeries ?? [],
            testTrades: testTrades.map(mapDbTradeToIndicatorInput),
          };
        },
      });

      // 将缝合结果与聚合绩效落盘至 masterRun
      await this.runRepository.update(
        { id: masterRun.id },
        {
          status: BacktestRunStatus.COMPLETED,
          totalReturn: report.overallOosMetrics.totalReturn,
          annualizedReturn: report.overallOosMetrics.annualizedReturn,
          maxDrawdown: report.overallOosMetrics.maxDrawdown,
          sharpeRatio: report.overallOosMetrics.sharpeRatio,
          calmarRatio: report.overallOosMetrics.calmarRatio,
          winRate: report.overallOosMetrics.winRate,
          profitLossRatio: report.overallOosMetrics.profitLossRatio,
          tradeCount: report.overallOosMetrics.tradeCount,
          navSeries: report.stitchedNavSeries as any,
          contextSnapshot: {
            ...(masterRun.contextSnapshot ?? {}),
            wfaReport: report,
          },
          completedAt: new Date(),
          errorMessage: null,
        },
      );

      this.logger.log(
        `WFA suite completed masterRunId=${masterRun.id} folds=${report.totalFolds} meanOverfitting=${report.meanOverfittingRatio} psi=${report.parameterStabilityIndex}`,
      );

      return report;
    } catch (error: any) {
      this.logger.error(
        `WFA suite execution failed masterRunId=${masterRun.id}: ${error.message}`,
        error.stack,
      );
      await this.runRepository.update(
        { id: masterRun.id },
        {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error.message ?? 'BACKTEST_WFA_FAILED',
        },
      );
      throw error;
    }
  }

  /**
   * 调度执行 A 股五大历史极端压力测试套件
   */
  async executeStressSuite(
    masterRun: BacktestRun,
    runSingle?: ChildRunExecutorFn,
  ): Promise<StressTestSuiteReport> {
    this.logger.log(
      `Starting Stress Testing suite execution masterRunId=${masterRun.id} suiteId=${masterRun.suiteId}`,
    );

    const executeChild = runSingle ?? ((id) => this.runChildDirectly(id));

    try {
      const stressContext = (masterRun.contextSnapshot?.stressOptions ??
        {}) as {
        scenarios?: string[];
      };

      let scenarios: readonly (StressScenarioDefinition | string)[];
      if (
        Array.isArray(stressContext.scenarios) &&
        stressContext.scenarios.length > 0
      ) {
        scenarios = stressContext.scenarios.map(
          (id) => getPresetStressScenario(id) ?? id,
        );
      } else {
        scenarios = listPresetStressScenarios();
      }

      const orchestrator = new StressTestingSuiteOrchestrator();
      const explicitUniverse = normalizeTargetUniverse(
        masterRun.targetUniverse,
      );
      const suiteInitialCash = resolvePortfolioInitialCash(
        explicitUniverse.length,
      );

      const report = await orchestrator.execute({
        scenarios,
        initialCash: suiteInitialCash,
        failFast: false,
        runner: async (scenario) => {
          this.logger.log(
            `Stress Scenario ${scenario.id}: [${scenario.startDate} ~ ${scenario.endDate}]`,
          );

          const targetUniverse =
            explicitUniverse.length > 0
              ? [...explicitUniverse]
              : normalizeTargetUniverse(scenario.recommendedUniverse);

          const childRun = await this.runRepository.save(
            this.runRepository.create({
              strategyDefinitionId: masterRun.strategyDefinitionId,
              strategyVersionId: masterRun.strategyVersionId,
              targetUniverse,
              targetIssues: [],
              period: masterRun.period,
              source: masterRun.source,
              startDate: new Date(scenario.startDate),
              endDate: new Date(scenario.endDate),
              status: BacktestRunStatus.PENDING,
              kind: masterRun.kind,
              parentRunId: masterRun.id,
              suiteId: masterRun.suiteId,
              stage: 'STRESS',
              scenarioId: scenario.id,
            }),
          );

          await executeChild(childRun.id);

          const completedChild = await this.runRepository.findOne({
            where: { id: childRun.id },
          });

          const trades = await this.tradeRepository.find({
            where: { backtestRunId: childRun.id },
          });

          const navSeries = (completedChild?.navSeries ?? []).map(
            (p) => p.totalEquity,
          );

          const effectiveTargetCount = resolveEffectiveTargetCount(
            completedChild?.targetUniverse ?? targetUniverse,
            completedChild?.targetIssues,
          );
          const scenarioInitialCash =
            resolvePortfolioInitialCash(effectiveTargetCount);

          return {
            navSeries,
            trades: trades.map(mapDbTradeToIndicatorInput),
            initialCash: scenarioInitialCash,
            rawResult: completedChild,
          };
        },
      });

      // 汇总各场景交易总数
      const totalTradeCount = report.scenarioOutcomes.reduce(
        (acc, outcome) => acc + outcome.trades.length,
        0,
      );

      // 将体检卡与最坏场景指标更新至 masterRun
      await this.runRepository.update(
        { id: masterRun.id },
        {
          status: BacktestRunStatus.COMPLETED,
          maxDrawdown: report.healthCard.worstCaseDrawdown,
          totalReturn: report.healthCard.averageTotalReturn,
          sharpeRatio: report.healthCard.averageSharpeRatio,
          tradeCount: totalTradeCount,
          contextSnapshot: {
            ...(masterRun.contextSnapshot ?? {}),
            stressReport: report,
          },
          completedAt: new Date(),
          errorMessage: null,
        },
      );

      this.logger.log(
        `Stress Testing suite completed masterRunId=${masterRun.id} total=${report.totalScenarios} passed=${report.passedScenarios} rating=${report.healthCard.overallRating}`,
      );

      return report;
    } catch (error: any) {
      this.logger.error(
        `Stress Testing suite execution failed masterRunId=${masterRun.id}: ${error.message}`,
        error.stack,
      );
      await this.runRepository.update(
        { id: masterRun.id },
        {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: error.message ?? 'BACKTEST_STRESS_FAILED',
        },
      );
      throw error;
    }
  }

  private async runChildDirectly(childRunId: number): Promise<void> {
    if (!this.runExecutor) {
      throw new Error(
        `BacktestRunExecutor is not available to execute child run ${childRunId}`,
      );
    }
    await this.runExecutor.execute(childRunId);
  }
}

function normalizeTargetUniverse(
  universe: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(universe)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of universe) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim();
    if (code.length === 0 || seen.has(code)) continue;
    seen.add(code);
    normalized.push(code);
  }
  return normalized;
}

function resolveEffectiveTargetCount(
  targetUniverse: readonly string[] | null | undefined,
  targetIssues?: readonly BacktestTargetIssue[] | null,
): number {
  const normalized = normalizeTargetUniverse(targetUniverse);
  if (!Array.isArray(targetIssues) || targetIssues.length === 0) {
    return normalized.length;
  }
  const failedCodes = new Set(
    targetIssues
      .map((issue) =>
        typeof issue.securityCode === 'string' ? issue.securityCode.trim() : '',
      )
      .filter((code) => code.length > 0),
  );
  return normalized.filter((code) => !failedCodes.has(code)).length;
}

function resolvePortfolioInitialCash(effectiveTargetCount: number): number {
  const scale = Math.max(MIN_CAPITAL_TARGET_COUNT, effectiveTargetCount);
  return scale * DEFAULT_BROKER_INITIAL_CASH;
}

function mapDbTradeToIndicatorInput(
  trade: BacktestTradeResult,
): ClosedTradeInput {
  return {
    realizedPnl: Number(trade.realizedPnl),
    returnRatio: Number(trade.returnRatio),
    isBlockedDelayed: false,
    slippageLoss: 0,
  };
}
