import {
  computeComprehensiveRiskPerformance,
  computeDailyReturns,
  type ComprehensiveRiskPerformanceResult,
} from '@app/indicators';
import {
  getPresetStressScenario,
  listPresetStressScenarios,
  type StressScenarioDefinition,
} from './stress-scenarios.constants';
import type {
  StressHealthCard,
  StressScenarioOutcome,
  StressScenarioRiskGrade,
  StressScenarioSurvivalAssessment,
  StressSuiteExecutionOptions,
  StressTestSuiteOverallRating,
  StressTestSuiteReport,
} from './stress-testing-suite.types';

/**
 * 极端压力测试套件编排器 (StressTestingSuiteOrchestrator)
 *
 * 核心职责：
 * 1. 批量调度并运行 A 股五大经典历史黑天鹅场景（或指定自定义场景）；
 * 2. 收集各场景每日净值 (navSeries) 与已平仓交易 (trades)；
 * 3. 基于 @app/indicators 纯数学 SIMD 算子计算极端风险指标 (VaR/CVaR/UnderwaterDuration/LiquidityPenalty)；
 * 4. 汇总生成《极端压力测试体检报告（Stress Health Card）》并输出风险评分与防御建议。
 */
export class StressTestingSuiteOrchestrator {
  constructor(
    private readonly defaultOptions?: Partial<StressSuiteExecutionOptions>,
  ) {}

  /**
   * 执行完整的压力测试套件并生成健康卡
   */
  public async execute(
    options: StressSuiteExecutionOptions,
  ): Promise<StressTestSuiteReport> {
    const mergedOptions: StressSuiteExecutionOptions = {
      ...this.defaultOptions,
      ...options,
    };

    const scenariosToRun = this.resolveScenarios(mergedOptions.scenarios);
    const outcomes: StressScenarioOutcome[] = [];

    for (const scenario of scenariosToRun) {
      try {
        const runResult = await mergedOptions.runner(scenario);
        const navSeries = runResult.navSeries ?? [];
        const trades = runResult.trades ?? [];

        const metrics = computeComprehensiveRiskPerformance(navSeries, trades, {
          initialCash: runResult.initialCash ?? mergedOptions.initialCash,
          annualRiskFreeRate: mergedOptions.annualRiskFreeRate,
          tradingDaysPerYear: mergedOptions.tradingDaysPerYear,
        });

        const survivalAssessment = this.evaluateSurvivalAssessment(
          metrics,
          navSeries,
          true,
        );

        outcomes.push({
          scenario,
          success: true,
          navSeries,
          trades,
          metrics,
          survivalAssessment,
        });
      } catch (error: any) {
        if (mergedOptions.failFast) {
          throw error;
        }

        const emptyMetrics = this.createEmptyMetrics();
        outcomes.push({
          scenario,
          success: false,
          error: error?.message ?? String(error),
          navSeries: [],
          trades: [],
          metrics: emptyMetrics,
          survivalAssessment: {
            worstDailyReturn: 0,
            maxUnderwaterDuration: 0,
            liquidityPenaltyLoss: 0,
            isBankrupt: false,
            riskGrade: 'FAILED',
          },
        });
      }
    }

    const totalScenarios = outcomes.length;
    const passedScenarios = outcomes.filter(
      (o) => o.success && o.survivalAssessment.riskGrade !== 'FAILED',
    ).length;
    const criticalScenarios = outcomes.filter(
      (o) =>
        o.survivalAssessment.riskGrade === 'CRITICAL' ||
        o.survivalAssessment.riskGrade === 'FAILED',
    ).length;

    const healthCard = this.aggregateHealthCard(outcomes);

    return {
      generatedAt: new Date().toISOString(),
      totalScenarios,
      passedScenarios,
      criticalScenarios,
      scenarioOutcomes: outcomes,
      healthCard,
    };
  }

  /**
   * 别名方法，与 execute 等价
   */
  public async run(
    options: StressSuiteExecutionOptions,
  ): Promise<StressTestSuiteReport> {
    return this.execute(options);
  }

  /**
   * 解析待执行场景列表（支持场景对象或预设场景 ID）
   */
  private resolveScenarios(
    scenarios?: readonly (StressScenarioDefinition | string)[],
  ): readonly StressScenarioDefinition[] {
    if (!scenarios || scenarios.length === 0) {
      return listPresetStressScenarios();
    }

    return scenarios.map((s) => {
      if (typeof s === 'string') {
        const found = getPresetStressScenario(s);
        if (!found) {
          throw new Error(`Unknown stress scenario id: ${s}`);
        }
        return found;
      }
      return s;
    });
  }

  /**
   * 评定单个场景的生存指标与风险等级
   */
  private evaluateSurvivalAssessment(
    metrics: ComprehensiveRiskPerformanceResult,
    navSeries: readonly number[],
    success: boolean,
  ): StressScenarioSurvivalAssessment {
    const { returns } = computeDailyReturns(navSeries);
    const worstDailyReturn =
      returns.length > 0 ? Math.round(Math.min(...returns) * 10000) / 10000 : 0;

    const isBankrupt =
      navSeries.some((n) => n <= 0) || metrics.totalReturn <= -1.0;

    const liquidityPenaltyLoss = metrics.totalLiquidityDelayPenalty;
    const maxUnderwaterDuration = metrics.maxUnderwaterDuration;

    let riskGrade: StressScenarioRiskGrade = 'SAFE';
    if (!success || isBankrupt) {
      riskGrade = 'FAILED';
    } else if (
      metrics.maxDrawdown >= 0.35 ||
      metrics.var99 <= -0.07 ||
      metrics.totalReturn <= -0.3
    ) {
      riskGrade = 'CRITICAL';
    } else if (
      metrics.maxDrawdown >= 0.18 ||
      metrics.var95 <= -0.04 ||
      metrics.maxUnderwaterDuration >= 45 ||
      liquidityPenaltyLoss > 0
    ) {
      riskGrade = 'WARNING';
    }

    return {
      worstDailyReturn,
      maxUnderwaterDuration,
      liquidityPenaltyLoss,
      isBankrupt,
      riskGrade,
    };
  }

  /**
   * 聚合所有场景结果，输出《极端压力测试体检报告（Stress Health Card）》
   */
  private aggregateHealthCard(
    outcomes: readonly StressScenarioOutcome[],
  ): StressHealthCard {
    if (outcomes.length === 0) {
      return {
        worstCaseDrawdown: 0,
        worstCaseScenarioId: '',
        maxUnderwaterDuration: 0,
        totalLiquidityPenalty: 0,
        worstDailyReturn: 0,
        averageSharpeRatio: 0,
        averageTotalReturn: 0,
        hasBankruptcy: false,
        overallHealthScore: 100,
        overallRating: 'EXCELLENT',
        keyRecommendations: ['未指定任何测试场景。'],
      };
    }

    let worstCaseDrawdown = 0;
    let worstCaseScenarioId = outcomes[0].scenario.id;
    let maxUnderwaterDuration = 0;
    let totalLiquidityPenalty = 0;
    let worstDailyReturn = 0;

    for (const outcome of outcomes) {
      if (outcome.metrics.maxDrawdown > worstCaseDrawdown) {
        worstCaseDrawdown = outcome.metrics.maxDrawdown;
        worstCaseScenarioId = outcome.scenario.id;
      }
      if (outcome.metrics.maxUnderwaterDuration > maxUnderwaterDuration) {
        maxUnderwaterDuration = outcome.metrics.maxUnderwaterDuration;
      }
      totalLiquidityPenalty += outcome.metrics.totalLiquidityDelayPenalty;
      if (outcome.survivalAssessment.worstDailyReturn < worstDailyReturn) {
        worstDailyReturn = outcome.survivalAssessment.worstDailyReturn;
      }
    }

    totalLiquidityPenalty = Math.round(totalLiquidityPenalty * 100) / 100;

    const successfulOutcomes = outcomes.filter((o) => o.success);
    const averageSharpeRatio =
      successfulOutcomes.length > 0
        ? Math.round(
            (successfulOutcomes.reduce(
              (acc, o) => acc + o.metrics.sharpeRatio,
              0,
            ) /
              successfulOutcomes.length) *
              10000,
          ) / 10000
        : 0;

    const averageTotalReturn =
      successfulOutcomes.length > 0
        ? Math.round(
            (successfulOutcomes.reduce(
              (acc, o) => acc + o.metrics.totalReturn,
              0,
            ) /
              successfulOutcomes.length) *
              10000,
          ) / 10000
        : 0;

    const hasBankruptcy = outcomes.some((o) => o.survivalAssessment.isBankrupt);

    // 综合健康评分 (0 ~ 100)
    let score = 100;
    if (hasBankruptcy) {
      score = 0;
    } else {
      const failedCount = outcomes.filter((o) => !o.success).length;
      score -= failedCount * 20;

      if (worstCaseDrawdown >= 0.5) {
        score -= 35;
      } else if (worstCaseDrawdown >= 0.35) {
        score -= 25;
      } else if (worstCaseDrawdown >= 0.2) {
        score -= 15;
      } else if (worstCaseDrawdown >= 0.1) {
        score -= 5;
      }

      if (maxUnderwaterDuration >= 100) {
        score -= 20;
      } else if (maxUnderwaterDuration >= 50) {
        score -= 10;
      } else if (maxUnderwaterDuration >= 25) {
        score -= 5;
      }

      if (totalLiquidityPenalty > 5000) {
        score -= 15;
      } else if (totalLiquidityPenalty > 0) {
        score -= 5;
      }

      if (worstDailyReturn <= -0.095) {
        score -= 15;
      } else if (worstDailyReturn <= -0.05) {
        score -= 5;
      }
    }

    const overallHealthScore = Math.max(0, Math.min(100, Math.round(score)));

    let overallRating: StressTestSuiteOverallRating = 'EXCELLENT';
    if (overallHealthScore < 50) {
      overallRating = 'FAIL';
    } else if (overallHealthScore < 70) {
      overallRating = 'FRAGILE';
    } else if (overallHealthScore < 85) {
      overallRating = 'ROBUST';
    }

    const keyRecommendations: string[] = [];
    if (hasBankruptcy) {
      keyRecommendations.push(
        '策略发生穿仓破产，必须立即检查仓位管理与硬止损强制平仓机制。',
      );
    }
    if (worstCaseDrawdown >= 0.25) {
      keyRecommendations.push(
        '最坏回撤超过 25%，建议在统一动作裁决器中强化系统性雪崩 (SYSTEMIC_CRUNCH) 紧急清仓门禁。',
      );
    }
    if (maxUnderwaterDuration >= 50) {
      keyRecommendations.push(
        '最大回撤潜伏期超过 50 个交易日，建议引入止损后冷静期或震荡休眠机制，避免单边阴跌频繁假突破磨损。',
      );
    }
    if (totalLiquidityPenalty > 0) {
      keyRecommendations.push(
        '存在跌停流动性冻结导致的顺延滑点损失，建议引入大盘微观流动性恶化预警，在右侧二卖确认时尽早出场。',
      );
    }
    if (worstDailyReturn <= -0.07) {
      keyRecommendations.push(
        '存在极端单日断崖式跌幅，建议在持仓端控制单日敞口，防范隔夜跳空与突发跌停。',
      );
    }

    if (keyRecommendations.length === 0) {
      keyRecommendations.push(
        '策略在五大历史极端压力测试中表现稳健，具备优异的极端行情生存能力与风控纪律。',
      );
    }

    return {
      worstCaseDrawdown,
      worstCaseScenarioId,
      maxUnderwaterDuration,
      totalLiquidityPenalty,
      worstDailyReturn,
      averageSharpeRatio,
      averageTotalReturn,
      hasBankruptcy,
      overallHealthScore,
      overallRating,
      keyRecommendations,
    };
  }

  private createEmptyMetrics(): ComprehensiveRiskPerformanceResult {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      calmarRatio: 0,
      winRate: 0,
      profitLossRatio: 0,
      tradeCount: 0,
      var95: 0,
      var99: 0,
      cvar95: 0,
      cvar99: 0,
      maxUnderwaterDuration: 0,
      totalLiquidityDelayPenalty: 0,
    };
  }
}
