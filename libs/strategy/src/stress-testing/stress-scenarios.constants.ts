import { MarketRiskRegime } from '../execution/execution-risk-arbiter';

export type StressScenarioId =
  | 'CRASH_2015'
  | 'CIRCUIT_2016'
  | 'BEAR_2018'
  | 'SQUEEZE_2024'
  | 'PULSE_2024';

export const STRESS_SCENARIO_IDS = {
  CRASH_2015: 'CRASH_2015',
  CIRCUIT_2016: 'CIRCUIT_2016',
  BEAR_2018: 'BEAR_2018',
  SQUEEZE_2024: 'SQUEEZE_2024',
  PULSE_2024: 'PULSE_2024',
} as const;

export interface StressScenarioDefinition {
  readonly id: StressScenarioId | string;
  readonly name: string;
  readonly regime: MarketRiskRegime | string;
  readonly startDate: string;
  readonly endDate: string;
  readonly description: string;
  readonly recommendedUniverse: readonly string[];
  readonly keyRisks: readonly string[];
}

/**
 * A 股五大历史极端压力测试沙盒基准场景注册表
 *
 * 场景时间段均严格位于 1996-12-16（涨跌停制度建立）之后，符合数据防毒门禁要求。
 */
export const PRESET_STRESS_SCENARIOS: Readonly<
  Record<StressScenarioId, StressScenarioDefinition>
> = Object.freeze({
  CRASH_2015: Object.freeze({
    id: 'CRASH_2015',
    name: '2015 杠杆股灾千股跌停',
    regime: MarketRiskRegime.SYSTEMIC_CRUNCH,
    startDate: '2015-06-15T00:00:00.000Z',
    endDate: '2015-08-26T00:00:00.000Z',
    description:
      '场外配资去杠杆引发断崖式暴跌，千股无量一字跌停与千股停牌躲避平仓，微观流动性彻底枯竭。',
    recommendedUniverse: Object.freeze(['000300', '000001', '399006']),
    keyRisks: Object.freeze([
      '一字跌停流动性冻结无法平仓出清',
      '极限穿仓与最坏回撤失控',
      '停牌导致持仓流动性冻结',
    ]),
  }),
  CIRCUIT_2016: Object.freeze({
    id: 'CIRCUIT_2016',
    name: '2016 熔断制度闪崩',
    regime: MarketRiskRegime.LIQUIDITY_FREEZE,
    startDate: '2016-01-04T00:00:00.000Z',
    endDate: '2016-01-07T00:00:00.000Z',
    description:
      '熔断机制引发磁吸效应闪崩，交易时间骤断与开盘隔夜严重跳空断层。',
    recommendedUniverse: Object.freeze(['000300', '000016', '000001']),
    keyRisks: Object.freeze([
      '交易时间骤断与撮合停滞',
      '隔夜跳空缺口吸收能力',
      '短时巨震下的极端风控响应',
    ]),
  }),
  BEAR_2018: Object.freeze({
    id: 'BEAR_2018',
    name: '2018 中美贸易战长周期阴跌',
    regime: MarketRiskRegime.ELEVATED_RISK,
    startDate: '2018-01-29T00:00:00.000Z',
    endDate: '2018-10-19T00:00:00.000Z',
    description:
      '中美贸易战长达 9 个月长周期单边阴跌，中枢持续下移，多头屡遭频繁假突破磨损。',
    recommendedUniverse: Object.freeze(['000300', '000905', '000852']),
    keyRisks: Object.freeze([
      '频繁假突破导致的连续止损磨损',
      '超长回撤潜伏期 (Underwater Duration)',
      '缺乏休眠冷静期防抽打机制时的慢性失血',
    ]),
  }),
  SQUEEZE_2024: Object.freeze({
    id: 'SQUEEZE_2024',
    name: '2024 微盘股踩踏雪球敲入',
    regime: MarketRiskRegime.LIQUIDITY_FREEZE,
    startDate: '2024-01-08T00:00:00.000Z',
    endDate: '2024-02-08T00:00:00.000Z',
    description:
      '雪球密集敲入与 DMA 杠杆赎回，微盘股踩踏无承接连续暴跌，多空挤兑与微观流动性恶化。',
    recommendedUniverse: Object.freeze(['000852', '932000', '000905']),
    keyRisks: Object.freeze([
      '中小微盘微观流动性瞬间枯竭',
      '宽基指数与中小市值个股剧烈背离',
      '出场受阻与滑点急剧扩大',
    ]),
  }),
  PULSE_2024: Object.freeze({
    id: 'PULSE_2024',
    name: '2024 924 暴利政策脉冲与极端高开低走',
    regime: MarketRiskRegime.ELEVATED_RISK,
    startDate: '2024-09-24T00:00:00.000Z',
    endDate: '2024-10-08T00:00:00.000Z',
    description:
      '924 暴利政策脉冲单边暴涨后，10月8日出现天量极端高开低走大阴线，追高防 FOMO 门禁。',
    recommendedUniverse: Object.freeze(['000300', '000001', '399006']),
    keyRisks: Object.freeze([
      '狂热情绪下的高位追涨与穿顶套牢',
      '天量高开低走巨幅单日波动回撤',
      '一字涨停无法买入与追高破板套牢',
    ]),
  }),
});

/**
 * 根据预设场景 ID 获取对应场景定义
 */
export function getPresetStressScenario(
  id: string,
): StressScenarioDefinition | undefined {
  return (PRESET_STRESS_SCENARIOS as Record<string, StressScenarioDefinition>)[
    id
  ];
}

/**
 * 获取所有预设五大历史压力场景列表
 */
export function listPresetStressScenarios(): readonly StressScenarioDefinition[] {
  return Object.values(PRESET_STRESS_SCENARIOS);
}
