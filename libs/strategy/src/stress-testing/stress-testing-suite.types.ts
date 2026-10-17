import type {
  ClosedTradeInput,
  ComprehensiveRiskPerformanceResult,
  PerformanceSummaryOptions,
} from '@app/indicators';
import type { StressScenarioDefinition } from './stress-scenarios.constants';

export type StressScenarioRiskGrade =
  | 'SAFE'
  | 'WARNING'
  | 'CRITICAL'
  | 'FAILED';

export type StressTestSuiteOverallRating =
  | 'EXCELLENT'
  | 'ROBUST'
  | 'FRAGILE'
  | 'FAIL';

export interface StressScenarioRunResult {
  /** 该场景回测产生的完整每日净值时序 (按日结算，长度 >= 1) */
  readonly navSeries: readonly number[];
  /** 场景内已平仓成交交易流水 */
  readonly trades?: readonly ClosedTradeInput[];
  /** 该场景回测初始现金，若未指定则使用套件默认初始资金 */
  readonly initialCash?: number;
  /** 附加原始结果（如回测 Run 详细记录或快照） */
  readonly rawResult?: unknown;
}

export type StressScenarioRunner = (
  scenario: StressScenarioDefinition,
) => Promise<StressScenarioRunResult> | StressScenarioRunResult;

export interface StressSuiteExecutionOptions extends PerformanceSummaryOptions {
  /** 指定要执行的场景列表（支持 StressScenarioDefinition 或场景 ID 字符串），默认执行全部五大预设场景 */
  readonly scenarios?: readonly (StressScenarioDefinition | string)[];
  /** 场景执行委托回调函数 */
  readonly runner: StressScenarioRunner;
  /** 是否在首个场景抛出异常时立即熔断中断套件执行，默认 false（记录错误并继续后续场景） */
  readonly failFast?: boolean;
}

export interface StressScenarioSurvivalAssessment {
  /** 场景最坏单日跌幅 (负数或 0) */
  readonly worstDailyReturn: number;
  /** 处于水下最长潜伏交易日数 (Underwater Duration) */
  readonly maxUnderwaterDuration: number;
  /** 跌停流动性惩罚损耗总额 (Liquidity Delay Penalty) */
  readonly liquidityPenaltyLoss: number;
  /** 是否发生穿仓（净值降至 <= 0 或亏损率 <= -100%） */
  readonly isBankrupt: boolean;
  /** 场景风险等级评定: 'SAFE' | 'WARNING' | 'CRITICAL' | 'FAILED' */
  readonly riskGrade: StressScenarioRiskGrade;
}

export interface StressScenarioOutcome {
  readonly scenario: StressScenarioDefinition;
  readonly success: boolean;
  readonly error?: string;
  readonly navSeries: readonly number[];
  readonly trades: readonly ClosedTradeInput[];
  /** 纯数学综合风险与绩效指标（来自 @app/indicators） */
  readonly metrics: ComprehensiveRiskPerformanceResult;
  /** 场景专属生存与风险体检评定 */
  readonly survivalAssessment: StressScenarioSurvivalAssessment;
}

export interface StressHealthCard {
  /** 最坏场景最大回撤（全场景最大值） */
  readonly worstCaseDrawdown: number;
  /** 产生最坏回撤的场景 ID */
  readonly worstCaseScenarioId: string;
  /** 全场景最长回撤潜伏期 (交易日数) */
  readonly maxUnderwaterDuration: number;
  /** 全场景流动性惩罚滑点总损失 */
  readonly totalLiquidityPenalty: number;
  /** 全场景最极端单日亏损 (最坏单日收益率) */
  readonly worstDailyReturn: number;
  /** 整体平均夏普比率 */
  readonly averageSharpeRatio: number;
  /** 整体平均总收益率 */
  readonly averageTotalReturn: number;
  /** 全场景是否发生过任何一次穿仓 */
  readonly hasBankruptcy: boolean;
  /** 总体健康评分 (0 ~ 100) */
  readonly overallHealthScore: number;
  /** 总体评级: 'EXCELLENT' | 'ROBUST' | 'FRAGILE' | 'FAIL' */
  readonly overallRating: StressTestSuiteOverallRating;
  /** 核心防御与改进建议 */
  readonly keyRecommendations: readonly string[];
}

export interface StressTestSuiteReport {
  /** 报告生成时间戳 (ISO 8601) */
  readonly generatedAt: string;
  /** 参与测试的场景总数 */
  readonly totalScenarios: number;
  /** 顺利通过测试的场景数 (success 且非 FAILED) */
  readonly passedScenarios: number;
  /** 触发严重告警或失败的场景数 (CRITICAL 或 FAILED) */
  readonly criticalScenarios: number;
  /** 各场景详细结果清单 */
  readonly scenarioOutcomes: readonly StressScenarioOutcome[];
  /** 极端压力测试体检报告（Stress Health Card） */
  readonly healthCard: StressHealthCard;
}
