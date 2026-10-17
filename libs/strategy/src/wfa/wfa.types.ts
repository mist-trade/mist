import type {
  ClosedTradeInput,
  ComprehensiveRiskPerformanceResult,
} from '@app/indicators';

export type WfaWindowType = 'rolling' | 'anchored';

export interface WfaSliceOptions {
  readonly startDate: string | Date;
  readonly endDate: string | Date;
  readonly windowType: WfaWindowType;
  /** 训练集（样本内 IS）窗口时长（月数），默认 12 */
  readonly trainDurationMonths?: number;
  /** 测试集（样本外 OOS）窗口时长（月数），默认 3 */
  readonly testDurationMonths?: number;
  /** 滚动步进时长（月数），默认与 testDurationMonths 一致 */
  readonly stepDurationMonths?: number;
}

export interface WfaFoldDefinition {
  readonly foldIndex: number;
  readonly trainStartDate: string;
  readonly trainEndDate: string;
  readonly testStartDate: string;
  readonly testEndDate: string;
}

export interface WfaNavPoint {
  readonly date: string;
  readonly totalEquity: number;
  readonly cash?: number;
  readonly marketValue?: number;
}

export interface WfaFoldExecutionResult {
  readonly foldIndex: number;
  readonly trainRunId?: number;
  readonly testRunId?: number;
  readonly trainSharpe: number;
  readonly testSharpe: number;
  readonly overfittingRatio: number;
  readonly testNavSeries: readonly WfaNavPoint[];
  readonly testTradeCount?: number;
  readonly trainMetrics?: unknown;
  readonly testMetrics?: unknown;
}

export interface WfaReport {
  readonly suiteId: string;
  readonly windowType: WfaWindowType;
  readonly totalFolds: number;
  readonly folds: readonly WfaFoldExecutionResult[];
  readonly stitchedNavSeries: readonly WfaNavPoint[];
  readonly meanOverfittingRatio: number;
  readonly parameterStabilityIndex: number;
  readonly overallOosMetrics: ComprehensiveRiskPerformanceResult;
}

export interface WfaFoldRunOutput {
  readonly trainRunId?: number;
  readonly testRunId?: number;
  readonly trainSharpe: number;
  readonly testSharpe: number;
  readonly trainTrades?: readonly ClosedTradeInput[];
  readonly testTrades?: readonly ClosedTradeInput[];
  readonly testNavSeries: readonly WfaNavPoint[];
  readonly trainMetrics?: unknown;
  readonly testMetrics?: unknown;
}

export type WfaFoldRunner = (
  fold: WfaFoldDefinition,
) => Promise<WfaFoldRunOutput> | WfaFoldRunOutput;

export interface WfaExecutionOptions {
  readonly suiteId?: string;
  readonly sliceOptions: WfaSliceOptions;
  readonly runner: WfaFoldRunner;
  readonly initialCapital?: number;
}
