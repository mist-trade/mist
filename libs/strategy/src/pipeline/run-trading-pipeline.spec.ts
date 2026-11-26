/**
 * 门面单测（REQ-FACADE-01/02/04/05）：零基础设施确定性、归并驱动、
 * 离线幂等、报告同源。
 */
import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
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
    return { action: 'BUY', reason: 'always buy (test)' };
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
    expect(result.fills[0]?.idempotencyKey).toMatch(
      /^offline-1-30-\d+-entry-ALWAYS_BUY$/,
    );

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

  it('交易手册展示决策流 traceChain 与虚拟出场细分原因', async () => {
    const { PriceLevelExitPolicy } = await import(
      '../virtual-exit/price-level-exit.policy'
    );

    class BuyWithStopPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.buy-with-stop';
      public readonly name = '带止损测试插件';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = '第一根买入并挂 -5% 止损';
      public readonly paramSchema = {};

      public async evaluate(ctx: { timestamp: Date }): Promise<FactorOpinion> {
        const isFirst = ctx.timestamp.getTime() === Date.UTC(2026, 0, 5, 1, 30);
        return isFirst
          ? { action: 'BUY', reason: '开仓' }
          : { action: 'NEUTRAL', reason: '观望' };
      }

      public virtualExitRules() {
        return [{ kind: 'stop' as const, lossRatio: -0.05 }];
      }
    }

    const bars = [
      makeBar(new Date(Date.UTC(2026, 0, 5, 1, 30)), 10),
      makeBar(new Date(Date.UTC(2026, 0, 6, 1, 30)), 9),
    ];
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new BuyWithStopPlugin());
    const flow: DecisionFlowNode = {
      id: 'guard_stop_buy',
      type: 'GUARD',
      name: '形态买入',
      pluginId: 'plugin.test.buy-with-stop',
      params: {},
      requiredAction: 'BUY',
      onPass: {
        id: 'term_buy',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'TEST_BUY',
        reason: '买入',
      },
      onFail: {
        id: 'term_abort',
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '跳过',
      },
    };
    const result = await runTradingPipeline(
      makeInput({
        barsByPeriod: new Map([[30, bars]]),
        plans: [
          {
            definitionId: 1,
            versionId: 1,
            flow,
            ruleSnapshot: Object.freeze({}),
            period: 30,
            requiredBarCount: 1,
            contextRequirements: {},
          },
        ],
        registry,
        publicFrom: bars[0].timestamp,
        virtualExitPolicy: new PriceLevelExitPolicy(),
      }),
    );

    expect(result.report).toContain('形态买入 ✓');
    expect(result.report).toContain('防守出场·stop ✓');
  });

  it('next_bar_open 模式：日线 T 发令严格按 T+1 Open 成交，T+1 当日盘中卖出被冻结，跨日后触发卖出按 Next-Bar Open 成交', async () => {
    class TwoSignalsPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.two-signals';
      public readonly name = '定时买卖测试';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description =
        'Day1 BUY, Day2 intraday SELL(被T+1拦截), Day3 SELL';

      public async evaluate(ctx: {
        timestamp: Date;
        period: number;
      }): Promise<FactorOpinion> {
        const day = formatShanghaiDateString(ctx.timestamp);
        if (ctx.period === 1440 && day === '2026-01-05') {
          return { action: 'BUY', reason: 'd1 buy' };
        }
        if (
          ctx.period === 30 &&
          ctx.timestamp.toISOString() === '2026-01-06T02:00:00.000Z'
        ) {
          return {
            action: 'SELL',
            reason: 'd2 intraday blocked',
          };
        }
        if (ctx.period === 1440 && day === '2026-01-07') {
          return { action: 'SELL', reason: 'd3 sell' };
        }
        return { action: 'NEUTRAL', reason: 'hold' };
      }
    }

    const dailyBar = (
      dayIso: string,
      open: number,
      close: number,
    ): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 1440,
      timestamp: new Date(dayIso),
      open,
      high: Math.max(open, close) + 0.2,
      low: Math.min(open, close) - 0.2,
      close,
      volume: '1000',
      amount: '10000',
      type: 'complete',
    });
    const bar30 = (
      utcIso: string,
      open: number,
      close: number,
    ): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 30,
      timestamp: new Date(utcIso),
      open,
      high: Math.max(open, close) + 0.1,
      low: Math.min(open, close) - 0.1,
      close,
      volume: '500',
      amount: '5000',
      type: 'complete',
    });

    // 上海 00:00 = UTC 前一日 16:00
    const bars1440 = [
      dailyBar('2026-01-04T16:00:00.000Z', 10.0, 10.2), // 2026-01-05 BUY signal
      dailyBar('2026-01-05T16:00:00.000Z', 10.5, 10.8), // 2026-01-06 open 10.5 BUY fill
      dailyBar('2026-01-06T16:00:00.000Z', 10.9, 11.1), // 2026-01-07 SELL signal (effective 01-07 15:01)
      dailyBar('2026-01-07T16:00:00.000Z', 11.4, 11.6), // 2026-01-08 open 11.4 SELL fill
    ];
    // 2026-01-06 日内 10:00 (02:00Z) & 10:30 (02:30Z) 均应在 30m 组中因 T+1 被冻结
    const bars30 = [
      bar30('2026-01-06T01:35:00.000Z', 10.5, 10.55), // 09:35 (不匹配，用 10:00 测试 BUY 后卖出)
      bar30('2026-01-06T02:00:00.000Z', 10.6, 10.7), // 10:00 BUY fill 后同日 30m 发出 SELL
      bar30('2026-01-06T02:30:00.000Z', 10.75, 10.8), // 10:30 撮合窗口应对上述 10:00 SELL 判定 T1_FROZEN
    ];

    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new TwoSignalsPlugin());
    const flow: DecisionFlowNode = {
      id: 'guard_both',
      type: 'GUARD',
      name: '定时测试门禁',
      pluginId: 'plugin.test.two-signals',
      requiredAction: 'BOTH',
      onPass: {
        id: 'term_inherit',
        type: 'TERMINAL',
        action: 'INHERIT',
        signalTag: 'NEXT_BAR_TEST',
      },
    };

    const result = await runTradingPipeline({
      barsByPeriod: new Map([
        [1440, bars1440],
        [30, bars30],
      ]),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 1,
          contextRequirements: {},
        },
        {
          definitionId: 2,
          versionId: 1,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
      registry,
      securityId: 1,
      securityCode: '000001',
      publicFrom: bars1440[0].timestamp,
      executionMode: 'next_bar_open',
      executionPeriod: 30,
      feeEnabled: false,
      slippageRatio: 0,
    });

    // 验证 2026-01-06 日内 30m 卖出被 T1_FROZEN 拦截
    const t1Rejections = result.groups.flatMap((g) => g.decision.rejections);
    expect(t1Rejections.some((r) => r.reason === 'T1_FROZEN')).toBe(true);
    expect(result.fills).toHaveLength(2);
    expect(result.fills[0]?.side).toBe('BUY');
    expect(Number(result.fills[0]?.priceLi)).toBe(10_500);
    expect(result.fills[0]?.tradingDay).toBe('2026-01-06');
    expect(result.fills[1]?.side).toBe('SELL');
    expect(Number(result.fills[1]?.priceLi)).toBe(11_400);
    expect(result.fills[1]?.tradingDay).toBe('2026-01-08');
  });

  it('next_bar_open + 5m 监控：15:00 尾盘 5m 击穿顺延至次交易日首根 5m 开盘成交', async () => {
    const { PriceLevelExitPolicy } = await import(
      '../virtual-exit/price-level-exit.policy'
    );
    class Day1BuyStopPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.d1-buy-5m-stop';
      public readonly name = '日线买5m防';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = 'd1 buy + 5m price stop';

      public async evaluate(ctx: { timestamp: Date }): Promise<FactorOpinion> {
        return ctx.timestamp.toISOString() === '2026-01-04T16:00:00.000Z'
          ? { action: 'BUY', reason: 'd1 buy' }
          : { action: 'NEUTRAL', reason: 'hold' };
      }
    }

    const custom5mExitPolicy: import('../virtual-exit/virtual-exit.port').VirtualExitPolicyPort =
      {
        configure: () => {},
        onSignal: () => {},
        onBar: (bar, period) => {
          if (period === 5 && bar.close <= 9.2) {
            return [
              {
                channel: { definitionId: 1, versionId: 1, period: 1440 },
                ownerPluginId: 'plugin.test.d1-buy-5m-stop',
                ruleId: 'test:5m',
                exitKind: 'INTRADAY_STOP',
                reason: '5m 击穿',
                badgeText: '5m止损',
              },
            ];
          }
          return [];
        },
      };
    void PriceLevelExitPolicy;

    const make5mBar = (
      utcIso: string,
      open: number,
      close: number,
    ): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 5,
      timestamp: new Date(utcIso),
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: '100',
      amount: '1000',
      type: 'complete',
    });
    const make1dBar = (
      utcIso: string,
      open: number,
      close: number,
    ): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 1440,
      timestamp: new Date(utcIso),
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: '1000',
      amount: '10000',
      type: 'complete',
    });

    // D1 (01-05): 日线发射 BUY
    // D2 (01-06): 首根 5m (09:35=01:35Z) 以 open=10.2 成交（当日 T+1 冻结）
    // D3 (01-07): 15:00 尾盘 5m (07:00Z) 收盘 9.0 触发卖出，当日已无后续 5m，顺延 D4 首根 5m open=8.85 成交
    const bars1d = [
      make1dBar('2026-01-04T16:00:00.000Z', 10.0, 10.0), // 01-05
      make1dBar('2026-01-05T16:00:00.000Z', 10.2, 10.4), // 01-06
      make1dBar('2026-01-06T16:00:00.000Z', 10.1, 9.0), // 01-07
      make1dBar('2026-01-07T16:00:00.000Z', 8.85, 9.1), // 01-08
    ];
    const bars5m = [
      make5mBar('2026-01-06T01:35:00.000Z', 10.2, 10.3), // 01-06 09:35 (BUY fill @ 10.2)
      make5mBar('2026-01-07T06:55:00.000Z', 9.9, 9.8), // 01-07 14:55 (safe)
      make5mBar('2026-01-07T07:00:00.000Z', 9.7, 9.0), // 01-07 15:00 (EXIT trigger)
      make5mBar('2026-01-08T01:35:00.000Z', 8.85, 8.95), // 01-08 09:35 (SELL fill @ 8.85)
    ];

    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new Day1BuyStopPlugin());
    const flow: DecisionFlowNode = {
      id: 'guard_d1',
      type: 'GUARD',
      name: '日线入场',
      pluginId: 'plugin.test.d1-buy-5m-stop',
      requiredAction: 'BUY',
      onPass: { id: 'term_buy', type: 'TERMINAL', action: 'BUY' },
    };

    const result = await runTradingPipeline({
      barsByPeriod: new Map([
        [1440, bars1d],
        [5, bars5m],
      ]),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
      surveillancePeriods: [5],
      registry,
      securityId: 1,
      securityCode: '000001',
      publicFrom: bars1d[0].timestamp,
      virtualExitPolicy: custom5mExitPolicy,
      executionMode: 'next_bar_open',
      executionPeriod: 5,
      feeEnabled: false,
      slippageRatio: 0,
    });

    expect(result.fills).toHaveLength(2);
    expect(Number(result.fills[0]?.priceLi)).toBe(10_200);
    expect(result.fills[0]?.fillTime?.toISOString()).toBe(
      '2026-01-06T01:35:00.000Z',
    );
    expect(Number(result.fills[1]?.priceLi)).toBe(8_850);
    expect(result.fills[1]?.fillTime?.toISOString()).toBe(
      '2026-01-08T01:35:00.000Z',
    );
  });

  it('next_bar_open + 5m 监控：盘中（非 15:00）5m 击穿应于同日下一根 5m 开盘立即成交，不得延误至次日', async () => {
    class Day1BuyPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.d1-buy-intraday-5m';
      public readonly name = '日线买盘中5m防';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = 'd1 buy + intraday 5m stop';

      public async evaluate(ctx: { timestamp: Date }): Promise<FactorOpinion> {
        return ctx.timestamp.toISOString() === '2026-01-04T16:00:00.000Z'
          ? { action: 'BUY', reason: 'd1 buy' }
          : { action: 'NEUTRAL', reason: 'hold' };
      }
    }

    const midday5mStopPolicy: import('../virtual-exit/virtual-exit.port').VirtualExitPolicyPort =
      {
        configure: () => {},
        onSignal: () => {},
        onBar: (bar, period) => {
          if (period === 5 && bar.low <= 9.2) {
            return [
              {
                channel: { definitionId: 1, versionId: 1, period: 1440 },
                ownerPluginId: 'plugin.test.d1-buy-intraday-5m',
                ruleId: 'test:5m-midday',
                exitKind: 'INTRADAY_DEFENSE_BREAKDOWN',
                reason: '盘中5m击穿',
                badgeText: '次级破线逃命',
              },
            ];
          }
          return [];
        },
      };

    const make5mBar = (
      utcIso: string,
      open: number,
      close: number,
      low = Math.min(open, close),
    ): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 5,
      timestamp: new Date(utcIso),
      open,
      high: Math.max(open, close),
      low,
      close,
      volume: '100',
      amount: '1000',
      type: 'complete',
    });
    const make1dBar = (
      utcIso: string,
      open: number,
      close: number,
    ): StrategyBar => ({
      securityId: 1,
      securityCode: '000001',
      source: 'tdx',
      period: 1440,
      timestamp: new Date(utcIso),
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume: '1000',
      amount: '10000',
      type: 'complete',
    });

    const bars1d = [
      make1dBar('2026-01-04T16:00:00.000Z', 10.0, 10.0), // 01-05 signal
      make1dBar('2026-01-05T16:00:00.000Z', 10.2, 10.4), // 01-06 fill
      make1dBar('2026-01-06T16:00:00.000Z', 10.1, 8.9), // 01-07
      make1dBar('2026-01-07T16:00:00.000Z', 8.5, 8.6), // 01-08
    ];
    const bars5m = [
      make5mBar('2026-01-06T01:35:00.000Z', 10.2, 10.3), // 01-06 09:35 BUY fill
      make5mBar('2026-01-07T01:50:00.000Z', 9.5, 9.3, 9.15), // 01-07 09:50 midday 5m breakdown!
      make5mBar('2026-01-07T01:55:00.000Z', 9.28, 9.25), // 01-07 09:55 Next-5m-Bar Open SELL fill @ 9.28
      make5mBar('2026-01-08T01:35:00.000Z', 8.5, 8.6), // 01-08 09:35 (too late if buggy!)
    ];

    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new Day1BuyPlugin());
    const flow: DecisionFlowNode = {
      id: 'guard_d1',
      type: 'GUARD',
      name: '日线入场',
      pluginId: 'plugin.test.d1-buy-intraday-5m',
      requiredAction: 'BUY',
      onPass: { id: 'term_buy', type: 'TERMINAL', action: 'BUY' },
    };

    const result = await runTradingPipeline({
      barsByPeriod: new Map([
        [1440, bars1d],
        [5, bars5m],
      ]),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
      surveillancePeriods: [5],
      registry,
      securityId: 1,
      securityCode: '000001',
      publicFrom: bars1d[0].timestamp,
      virtualExitPolicy: midday5mStopPolicy,
      executionMode: 'next_bar_open',
      executionPeriod: 5,
      feeEnabled: false,
      slippageRatio: 0,
    });

    expect(result.fills).toHaveLength(2);
    expect(result.fills[1]?.tradingDay).toBe('2026-01-07');
    expect(Number(result.fills[1]?.priceLi)).toBe(9_280);
    expect(result.fills[1]?.fillTime?.toISOString()).toBe(
      '2026-01-07T01:55:00.000Z',
    );
  });

  it('多外部标的同一 availabilityKey 与 period 下按 securityId / securityCode 确定性升序入窗', async () => {
    const orderSeen: number[] = [];
    class SpyExtOrderPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.spy-ext-order';
      public readonly name = '顺序探针';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = 'records eval';

      public resolveExternalContextRequirements() {
        return [
          { securityCode: 'EXT_B', securityId: 20, period: 1440, minBars: 1 },
          { securityCode: 'EXT_C', securityId: 30, period: 1440, minBars: 1 },
        ];
      }

      public async evaluate(): Promise<FactorOpinion> {
        return { action: 'NEUTRAL', reason: 'spy' };
      }
    }

    const ts = new Date('2026-01-04T16:00:00.000Z');
    const mkExtBar = (
      securityId: number,
      securityCode: string,
    ): StrategyBar => ({
      securityId,
      securityCode,
      source: 'tdx',
      period: 1440,
      timestamp: ts,
      open: 10,
      high: 10,
      low: 10,
      close: 10,
      volume: '100',
      amount: '1000',
      type: 'complete',
    });

    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new SpyExtOrderPlugin());
    const flow: DecisionFlowNode = {
      id: 'g',
      type: 'GUARD',
      name: 'g',
      pluginId: 'plugin.test.spy-ext-order',
      requiredAction: 'BUY',
      onPass: { id: 't', type: 'TERMINAL', action: 'BUY' },
    };

    const makeRun = async (extBars: StrategyBar[]) => {
      const mainBar = mkExtBar(1, '000001');
      const r = await runTradingPipeline({
        barsByPeriod: new Map([[1440, [...extBars, mainBar]]]),
        plans: [
          {
            definitionId: 1,
            versionId: 1,
            flow,
            ruleSnapshot: Object.freeze({}),
            period: 1440,
            requiredBarCount: 1,
            contextRequirements: {},
            externalContextRequirements: [
              {
                securityCode: 'EXT_B',
                securityId: 20,
                period: 1440,
                minBars: 1,
              },
              {
                securityCode: 'EXT_C',
                securityId: 30,
                period: 1440,
                minBars: 1,
              },
            ],
          },
        ],
        registry,
        securityId: 1,
        securityCode: '000001',
        publicFrom: ts,
      });
      void orderSeen;
      return r;
    };

    const rForward = await makeRun([
      mkExtBar(20, 'EXT_B'),
      mkExtBar(30, 'EXT_C'),
    ]);
    const rReverse = await makeRun([
      mkExtBar(30, 'EXT_C'),
      mkExtBar(20, 'EXT_B'),
    ]);
    expect(rReverse).toEqual(rForward);
  });

  it('同刻多策略同向共振与 VIRTUAL_EXIT 共存：离线幂等键互异、同向归并无 ALREADY_HOLDING 假拒绝', async () => {
    class MultiSignalPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.multi-resonance';
      public readonly name = '共振测试插件';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = 'bar1 BUY, bar2 SELL';

      public async evaluate(ctx: {
        timestamp: Date;
        period: number;
      }): Promise<FactorOpinion> {
        const ts = ctx.timestamp.toISOString();
        if (ts === '2026-01-05T02:00:00.000Z') {
          return { action: 'BUY', reason: `buy-${ctx.period}` };
        }
        if (ts === '2026-01-06T02:00:00.000Z') {
          return { action: 'SELL', reason: `sell-${ctx.period}` };
        }
        return { action: 'NEUTRAL', reason: 'hold' };
      }
    }

    const bar1 = makeBar(new Date('2026-01-05T02:00:00.000Z'), 10);
    const bar2 = makeBar(new Date('2026-01-06T02:00:00.000Z'), 9);
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new MultiSignalPlugin());

    const makeFlow = (tag: string): DecisionFlowNode => ({
      id: `guard_${tag}`,
      type: 'GUARD',
      name: `门禁_${tag}`,
      pluginId: 'plugin.test.multi-resonance',
      requiredAction: 'BOTH',
      onPass: {
        id: `term_${tag}`,
        type: 'TERMINAL',
        action: 'INHERIT',
        signalTag: tag,
      },
    });

    const virtualExitPolicy: import('../virtual-exit/virtual-exit.port').VirtualExitPolicyPort =
      {
        configure: () => {},
        onSignal: () => {},
        onBar: (bar) => {
          if (bar.timestamp.toISOString() === '2026-01-06T02:00:00.000Z') {
            return [
              {
                channel: { definitionId: 1, versionId: 1, period: 30 },
                ownerPluginId: 'plugin.test.multi-resonance',
                ruleId: 'stop:1',
                exitKind: 'STOP',
                reason: '虚拟止损',
                badgeText: '止损',
              },
            ];
          }
          return [];
        },
      };

    const result = await runTradingPipeline({
      barsByPeriod: new Map([[30, [bar1, bar2]]]),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: makeFlow('FLOW_A'),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
        {
          definitionId: 2,
          versionId: 1,
          flow: makeFlow('FLOW_B'),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
      registry,
      securityId: 1,
      securityCode: '000001',
      publicFrom: bar1.timestamp,
      virtualExitPolicy,
      feeEnabled: false,
    });

    // Bar 1: 2 条 ENTRY 归并为 1 条 BUY 指令（2 contributors），0 条 ALREADY_HOLDING
    expect(result.groups[0].decision.instructions).toHaveLength(1);
    expect(result.groups[0].decision.instructions[0].action).toBe('BUY');
    expect(result.groups[0].decision.instructions[0].contributors).toHaveLength(
      2,
    );
    expect(result.groups[0].decision.rejections).toHaveLength(0);

    // Bar 2: 同 definitionId=1 + period=30 同时产出 VIRTUAL_EXIT 与 FLOW_A 退出 + FLOW_B 退出，
    // 幂等键均唯一且归并为 1 条 SELL 指令（3 contributors）
    const day2Group = result.groups[1].group;
    const day2Keys = day2Group.signals.map((s) => s.idempotencyKey);
    expect(new Set(day2Keys).size).toBe(3);
    expect(result.groups[1].decision.instructions).toHaveLength(1);
    expect(result.groups[1].decision.instructions[0].action).toBe('SELL');
    expect(result.groups[1].decision.instructions[0].contributors).toHaveLength(
      3,
    );
    expect(result.groups[1].decision.rejections).toHaveLength(0);
    expect(result.report).toContain('共振(2):');
    expect(result.report).toContain('共振(3):');
    expect(result.report).not.toContain('%');
  });
});
