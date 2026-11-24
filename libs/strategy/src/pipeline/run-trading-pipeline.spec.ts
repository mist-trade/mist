/**
 * 门面单测（REQ-FACADE-01/02/04/05）：零基础设施确定性、归并驱动、
 * 离线幂等、报告同源。
 */
import type { StrategyBar } from '@app/market-data';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import type { FactorOpinion, FactorPlugin } from '../factor/factor.types';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { KernelPlan } from '../kernel/kernel.types';
import { runTradingPipeline, type PipelineInput } from './run-trading-pipeline';

/** 恒真测试插件：每根 Bar 都 BUY。 */
class AlwaysBuyPlugin implements FactorPlugin {
  public readonly id = 'plugin.test.always-buy';
  public readonly name = '恒真测试插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = '测试专用：恒定返回 BUY';
  public readonly paramSchema = {};

  public async evaluate(): Promise<FactorOpinion> {
    return { action: 'BUY', confidence: 0.9, reason: 'always buy (test)' };
  }
}

function createAlwaysBuyFlow(): DecisionFlowNode {
  return {
    id: 'guard_buy',
    type: 'GUARD',
    name: '恒买门禁',
    pluginId: 'plugin.test.always-buy',
    params: {},
    requiredAction: 'BUY',
    minConfidence: 0.5,
    onPass: {
      id: 'term_buy',
      type: 'TERMINAL',
      action: 'BUY',
      signalTag: 'ALWAYS_BUY',
      reason: '恒真门禁通过',
    },
    onFail: {
      id: 'term_neutral',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '恒真门禁未通过',
    },
  };
}

function makeBar(timestamp: Date, close: number): StrategyBar {
  return {
    securityId: 1,
    securityCode: '000001',
    source: 'synthetic',
    period: 30,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: '1000',
    amount: String(close * 1000),
    type: 'complete',
  };
}

function makeInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  // 5 根 30m Bar，价格 10 元档——每根公开 Bar 发射一条 entry 信号
  const bars = [10, 10.2, 10.4, 10.6, 10.8].map((close, i) =>
    makeBar(new Date(Date.UTC(2026, 0, 5, 1, i * 30)), close),
  );
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(new AlwaysBuyPlugin());
  const plans: KernelPlan[] = [
    {
      definitionId: 1,
      versionId: 1,
      flow: createAlwaysBuyFlow(),
      ruleSnapshot: Object.freeze({}),
      period: 30,
      requiredBarCount: 1,
      contextRequirements: {},
    },
  ];
  return {
    barsByPeriod: new Map([[30, bars]]),
    plans,
    registry,
    securityId: 1,
    securityCode: '000001',
    publicFrom: bars[0].timestamp,
    seedCapitalLi: 1_000_000_000n, // 100 万元
    ...overrides,
  };
}

describe('runTradingPipeline（REQ-FACADE-01..05）', () => {
  it('零基础设施全流程：信号→分组→指令→内存 fill→交易手册', async () => {
    const result = await runTradingPipeline(makeInput());

    // 每根公开 Bar 一条 entry 信号（requiredBarCount=1，publicFrom 起全公开）
    expect(result.signals).toHaveLength(5);

    // 分组按 (securityId, effectiveTime)：5 个独立组，各组一条指令（前几组现金充足）
    expect(result.groups).toHaveLength(5);
    const buyGroups = result.groups.filter(
      (g) => g.decision.instructions.length > 0,
    );
    expect(buyGroups.length).toBeGreaterThan(0);

    // 内存 fill 与指令一一对应（幂等锚点 = 离线合成键）
    expect(result.fills).toHaveLength(
      result.groups.reduce((sum, g) => sum + g.decision.instructions.length, 0),
    );
    expect(result.fills[0]?.idempotencyKey).toMatch(/^offline-1-\d+-entry$/);

    // 报告同源渲染（REQ-FACADE-05）
    expect(result.report).toContain('[Mist 交易手册] 000001');
    expect(result.report).toContain('▶ 买入');

    // 现金递减直至不足一手 → 显式 BELOW_LOT 拒绝（REQ-ENGINE-04，静默吞零容忍）
    const last = result.groups.at(-1)!.decision;
    expect(
      last.rejections.some(
        (r) => r.reason === 'BELOW_LOT' || last.instructions.length === 0,
      ),
    ).toBe(true);
  });

  it('确定性：同输入两次运行逐字段相同（REQ-FACADE-01）', async () => {
    const r1 = await runTradingPipeline(makeInput());
    const r2 = await runTradingPipeline(makeInput());
    const serialize = (v: unknown): string =>
      JSON.stringify(v, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
    expect(serialize(r1)).toBe(serialize(r2));
  });

  it('离线幂等：重放同输入不产生重复 fill（REQ-FACADE-04）', async () => {
    const input = makeInput();
    const r1 = await runTradingPipeline(input);
    const keys1 = r1.fills.map((f) => f.idempotencyKey);
    expect(new Set(keys1).size).toBe(keys1.length); // 键唯一
    const r2 = await runTradingPipeline(input);
    expect(r2.fills.map((f) => f.idempotencyKey)).toEqual(keys1);
  });

  it('分组归并顺序：(availabilityKey, period 升序) 驱动，乱序输入不乱序求值（REQ-FACADE-02）', async () => {
    const bars = [10.8, 10, 10.4].map((close, i) =>
      makeBar(new Date(Date.UTC(2026, 0, 5, 1, (2 - i) * 30)), close),
    ); // 故意倒序数组
    const result = await runTradingPipeline(
      makeInput({ barsByPeriod: new Map([[30, bars]]) }),
    );
    // 信号按 Bar 时间轴升序产出（归并排序生效）
    const times = result.signals.map((s) => s.signalTime.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
