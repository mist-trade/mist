import {
  computeComprehensiveRiskPerformance,
  computeOverfittingRatio,
  type ClosedTradeInput,
} from '@app/indicators';
import { sliceWfaWindows } from './wfa-window-slicer';
import {
  computeParameterStabilityIndex,
  stitchWfaNavSeries,
} from './wfa-stitcher';
import type {
  WfaExecutionOptions,
  WfaFoldExecutionResult,
  WfaReport,
} from './wfa.types';

export class WalkForwardOrchestrator {
  /**
   * 纯领域 WFA 滚动前向回测执行总调度。
   *
   * 1. 切分时间窗口（Rolling / Anchored）；
   * 2. 调度执行各 Fold 的样本内训练与样本外测试；
   * 3. 汇总计算样本外夏普衰减率与跨 Fold 稳定性；
   * 4. 缝合连续 OOS 前向净值曲线并输出综合风险绩效。
   */
  async execute(options: WfaExecutionOptions): Promise<WfaReport> {
    const folds = sliceWfaWindows(options.sliceOptions);
    const suiteId = options.suiteId ?? `wfa-${Date.now()}`;
    const initialCapital = options.initialCapital ?? 100000;

    const foldResults: WfaFoldExecutionResult[] = [];
    const allTestTrades: ClosedTradeInput[] = [];

    for (const fold of folds) {
      const output = await options.runner(fold);

      const overfittingRatio = computeOverfittingRatio(
        output.trainSharpe,
        output.testSharpe,
      );

      foldResults.push({
        foldIndex: fold.foldIndex,
        trainRunId: output.trainRunId,
        testRunId: output.testRunId,
        trainSharpe: output.trainSharpe,
        testSharpe: output.testSharpe,
        overfittingRatio,
        testNavSeries: output.testNavSeries,
        testTradeCount: output.testTrades?.length,
        trainMetrics: output.trainMetrics,
        testMetrics: output.testMetrics,
      });

      if (output.testTrades && output.testTrades.length > 0) {
        allTestTrades.push(...output.testTrades);
      }
    }

    const stitchedNavSeries = stitchWfaNavSeries(foldResults, initialCapital);

    const totalOverfitting = foldResults.reduce(
      (sum, f) => sum + f.overfittingRatio,
      0,
    );
    const meanOverfittingRatio =
      foldResults.length > 0
        ? Math.round((totalOverfitting / foldResults.length) * 10000) / 10000
        : 0;

    const parameterStabilityIndex = computeParameterStabilityIndex(foldResults);

    const stitchedEquities = stitchedNavSeries.map((p) => p.totalEquity);
    const overallOosMetrics = computeComprehensiveRiskPerformance(
      stitchedEquities,
      allTestTrades,
      { initialCash: initialCapital },
    );

    return {
      suiteId,
      windowType: options.sliceOptions.windowType,
      totalFolds: foldResults.length,
      folds: foldResults,
      stitchedNavSeries,
      meanOverfittingRatio,
      parameterStabilityIndex,
      overallOosMetrics,
    };
  }
}
