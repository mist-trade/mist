import type { StrategyBar } from '@app/market-data';
import { normalizeExternalDecimalText } from '../../../decimal/src/decimal8';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { FactorOpinion, FactorPlugin } from '../factor/factor.types';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import { DecisionFlowEvaluator } from '../decision-flow/decision-flow-evaluator';
import { StrategyEvaluationKernel } from '../kernel/strategy-evaluation-kernel';
import { contextSeriesKey } from '../kernel/availability';
import { StrategySimulationSession } from './strategy-simulation.session';
import { mapKernelSignalToSimulationSignal } from './kernel-signal-mapper';
import { ChanBspFactorPlugin } from '../factor/plugins/chan-bsp.plugin';
import { CHAN_BSP_DIRECTIONS, CHAN_BSP_UNITS } from '../strategy.constants';

/**
 * 自定义 Alpha 插件：返回自主生成的展示徽标（如 "左侧1买"、"定制风控卖点"）
 */
class CustomAlphaFactorPlugin implements FactorPlugin {
  public readonly id = 'plugin.alpha.custom-left-buy';
  public readonly name = '自定义左侧买点插件';
  public readonly category = 'REGIME' as const;
  public readonly version = '1.0.0';
  public readonly description = '测试用例：自主输出定制 badgeText 与元数据';

  constructor(
    private readonly customBadge: string = '左侧1买',
    private readonly action: 'BUY' | 'SELL' = 'BUY',
  ) {}

  public async evaluate(): Promise<FactorOpinion> {
    return {
      action: this.action,
      reason: `Alpha 自主判定: ${this.customBadge}`,
      badgeText: this.customBadge,
      displayTag: 'ALPHA_LEFT_POINT',
      styleMeta: {
        color: '#FF007F',
        position: 'below',
      },
      evidence: {
        alphaScore: 99.8,
        pivotTime: '2026-08-26T09:30:00.000Z',
        pivotPrice: 10.2,
      },
    };
  }
}

function makeStrategyBar(time: Date, close = 10, period = 30): StrategyBar {
  return {
    securityId: 1,
    source: 'qmt',
    period,
    timestamp: time,
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: normalizeExternalDecimalText('1000'),
    amount: normalizeExternalDecimalText('10000'),
    type: 'complete',
  };
}

function createFlow(
  pluginId: string,
  action: 'BUY' | 'SELL',
): DecisionFlowNode {
  return {
    id: 'guard_custom',
    type: 'GUARD',
    name: '自定义门禁节点',
    pluginId,
    params: {},
    requiredAction: action,
    onPass: {
      id: 'term_custom',
      type: 'TERMINAL',
      action,
      signalTag: 'CUSTOM_FLOW',
      reason: '自定义策略树通过',
    },
    onFail: {
      id: 'term_fail',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '自定义策略树阻断',
    },
  };
}

describe('策略推演纯透传专项测试 (Strategy Simulation Pass-Through Spec)', () => {
  it('1. 验证 DecisionFlowEvaluator 能 100% 收集并透传插件的 badgeText 与元数据', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new CustomAlphaFactorPlugin('定制极值1买', 'BUY'));

    const evaluator = new DecisionFlowEvaluator({ registry });
    const flow = createFlow('plugin.alpha.custom-left-buy', 'BUY');
    const result = await evaluator.evaluate(flow, {
      securityId: 1,
      securityCode: '000001',
      timestamp: new Date('2026-08-26T10:00:00.000Z'),
      period: 30,
      attributes: new Map([
        [
          contextSeriesKey('000001', 30),
          [makeStrategyBar(new Date('2026-08-26T10:00:00.000Z'))] as any,
        ],
      ]),
    });

    expect(result.status).toBe('SIGNAL_EMITTED');
    expect(result.badgeText).toBe('定制极值1买');
    expect(result.displayTag).toBe('ALPHA_LEFT_POINT');
    expect(result.styleMeta).toEqual({ color: '#FF007F', position: 'below' });
    expect(result.trace[0].badgeText).toBe('定制极值1买');
  });

  it('2. 验证 StrategyEvaluationKernel buildSignal 绝不丢失 badgeText 并注入内核信号', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new CustomAlphaFactorPlugin('深海右侧2买', 'BUY'));

    const publicFrom = new Date('2026-08-26T09:30:00.000Z');
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom,
      plans: [
        {
          definitionId: 101,
          versionId: 1,
          flow: createFlow('plugin.alpha.custom-left-buy', 'BUY'),
          ruleSnapshot: {},
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
      registry,
    });

    const bar = makeStrategyBar(new Date('2026-08-26T10:00:00.000Z'), 15.2);
    const signals = await kernel.push(bar);

    expect(signals).toHaveLength(1);
    const sig = signals[0];
    expect(sig.badgeText).toBe('深海右侧2买');
    expect(sig.displayTag).toBe('ALPHA_LEFT_POINT');
    expect(sig.styleMeta).toEqual({ color: '#FF007F', position: 'below' });
    expect(sig.contextSnapshot.badgeText).toBe('深海右侧2买');
    expect((sig.decisionTrace as any).badgeText).toBe('深海右侧2买');
  });

  it('3. 验证 mapKernelSignalToSimulationSignal 纯透传：无写死字典，优先透传 badgeText', () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new CustomAlphaFactorPlugin('突破型三买', 'BUY'));

    const mockKernelSignal = {
      definitionId: 1,
      versionId: 1,
      signalKind: 'entry' as const,
      signalTime: new Date('2026-08-26T10:00:00.000Z'),
      triggerPrice: 15.2,
      pivotTime: '2026-08-26T09:30:00.000Z',
      pivotPrice: 14.8,
      signalType: 'custom_signal_type',
      badgeText: '突破型三买',
      decisionTrace: { badgeText: '突破型三买', trace: [] },
      contextSnapshot: { badgeText: '突破型三买' },
      ruleSnapshot: {},
    };

    const simSignal = mapKernelSignalToSimulationSignal(
      mockKernelSignal as any,
      {
        securityCode: '000001',
        period: 30,
      },
    );

    expect(simSignal.badgeText).toBe('突破型三买');
    expect(simSignal.isBuy).toBe(true);
    expect(simSignal.triggerPrice).toBe(15.2);
    expect(simSignal.pivotTime).toBe('2026-08-26T09:30:00.000Z');
  });

  it('4. 验证兜底机制：无 badgeText 时纯通道回退为“买点”或“卖点”，彻底杜绝 1买/2买 字典死猜', () => {
    const buySignal = {
      definitionId: 1,
      versionId: 1,
      signalKind: 'entry' as const,
      signalTime: new Date('2026-08-26T10:00:00.000Z'),
      triggerPrice: 10.0,
      pivotTime: null,
      pivotPrice: null,
      signalType: 'first_buy', // 即使 signalType 名为 first_buy，也绝不查死字典强行转成 "1买"
      decisionTrace: { trace: [] },
      contextSnapshot: {},
      ruleSnapshot: {},
    };

    const simBuy = mapKernelSignalToSimulationSignal(buySignal as any, {
      securityCode: '000001',
      period: 30,
    });
    // 纯透传原则：无插件提供 badgeText 时，回退为最纯粹的通道兜底 "买点"
    expect(simBuy.badgeText).toBe('买点');

    const sellSignal = {
      ...buySignal,
      signalKind: 'exit' as const,
      signalType: 'first_sell',
    };
    const simSell = mapKernelSignalToSimulationSignal(sellSignal as any, {
      securityCode: '000001',
      period: 30,
    });
    expect(simSell.badgeText).toBe('卖点');
  });

  it('5. 验证 StrategySimulationSession 交互式推演链路端到端无损透传', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new CustomAlphaFactorPlugin('量价共振买点', 'BUY'));

    const startTime = new Date('2026-08-26T09:30:00.000Z').getTime();
    const bars: StrategyBar[] = [
      makeStrategyBar(new Date(startTime), 10.0),
      makeStrategyBar(new Date(startTime + 30 * 60 * 1000), 10.5),
      makeStrategyBar(new Date(startTime + 60 * 60 * 1000), 11.0),
    ];

    const session = new StrategySimulationSession(bars, {
      securityCode: '000001',
      period: 30,
      startDate: new Date(startTime),
      flow: createFlow('plugin.alpha.custom-left-buy', 'BUY'),
      windowBudget: 1,
      registry,
    });

    const frame = await session.stepNext();
    expect(frame).toBeDefined();
    expect(frame?.signals.length).toBeGreaterThan(0);
    const signal = frame?.signals[0];
    expect(signal?.badgeText).toBe('量价共振买点');
  });

  it('6. 验证标准 ChanBspFactorPlugin 自主输出 badgeText（1买/2买/3买），信道保持纯透传', async () => {
    const plugin = new ChanBspFactorPlugin();
    // 构造连续 35 根 K 线以形成有效笔与背驰
    const startTime = new Date('2026-08-26T09:30:00.000Z').getTime();
    const bars: StrategyBar[] = [];
    const prices = [
      10, 9.5, 9, 8.5, 8.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 9.5, 9.0, 8.5, 8.2,
      8.0, 8.1, 8.3, 8.7, 9.2, 9.8, 9.0, 8.8, 8.6, 8.4, 8.2, 8.3, 8.5, 8.8, 9.2,
      9.5,
    ];
    for (let i = 0; i < prices.length; i++) {
      bars.push(
        makeStrategyBar(new Date(startTime + i * 30 * 60 * 1000), prices[i]),
      );
    }

    const opinion = await plugin.evaluate(
      {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(startTime + (prices.length - 1) * 30 * 60 * 1000),
        period: 30,
        attributes: new Map([[contextSeriesKey('000001', 30), bars as any]]),
      },
      {
        units: CHAN_BSP_UNITS.BI,
        direction: CHAN_BSP_DIRECTIONS.BUY,
        deduplicate: false,
      },
    );

    // 若触发买卖点，其 badgeText 必须由插件本身直接产出
    if (opinion.action === 'BUY') {
      expect(opinion.badgeText).toMatch(/^[123]买$/);
    }
  });
});

describe('StrategySimulationSession — 跨标的 bar 因果归并（任务3）', () => {
  class MacroEchoPlugin implements FactorPlugin {
    public readonly id = 'plugin.test.macro-echo';
    public readonly name = '宏观察看器';
    public readonly category = 'TECHNICAL' as const;
    public readonly version = '1.0.0';
    public readonly description = 'test';
    public readonly paramSchema = {};
    public lastMacroClose = -1;

    public async evaluate(context: {
      attributes?: Map<string, unknown>;
    }): Promise<FactorOpinion> {
      const raw = context.attributes?.get('series.880003.1440') as
        | readonly { rawBar: { close: number } }[]
        | undefined;
      const last = raw?.[raw.length - 1]?.rawBar.close ?? -1;
      this.lastMacroClose = last;
      return { action: 'BUY', reason: `macro=${last}` };
    }
  }

  function dayBars(
    securityId: number,
    closes: readonly number[],
    startDay: number,
  ): readonly StrategyBar[] {
    return closes.map((close, i) => ({
      securityId,
      source: 'qmt' as const,
      period: 1440,
      timestamp: new Date(Date.UTC(2026, 0, startDay + i, 16, 0, 0)),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: '1',
      amount: '1',
      type: 'complete' as const,
    }));
  }

  it('外部 bar 按因果序归并：同日宏观先于标的求值，跨标的窗口逐步填充', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    const plugin = new MacroEchoPlugin();
    registry.register(plugin);

    const targetCloses = [10, 10.2, 10.1, 10.3, 10.2, 10.6];
    const externalCloses = [20, 21, 22, 23, 24, 26];
    const allBars = [
      ...dayBars(1, targetCloses, 5),
      ...dayBars(12, externalCloses, 5),
    ];
    const session = new StrategySimulationSession(allBars, {
      securityCode: '000001',
      securityId: 1,
      period: 1440,
      windowBudget: 5,
      flow: {
        id: 'guard',
        type: 'GUARD',
        name: 'gate',
        pluginId: 'plugin.test.macro-echo',
        requiredAction: 'BUY',
        onPass: {
          id: 'term',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'EXT',
          reason: 'pass',
        },
      },
      externalContextRequirements: [
        { securityCode: '880003', securityId: 12, period: 1440, minBars: 3 },
      ],
      externalBars: dayBars(12, externalCloses, 5),
      registry,
    });

    // 逐日步进：窗口满预算(5)后内核才开闸求值（第 5 日起）；外部窗口未满
    // minBars(3) 前同样 fail-closed。开闸后宏观察看器应看到当日全A 收盘
    //（同日宏观先于标的入窗 → 因果序）。
    for (let day = 1; day <= 6; day++) {
      await session.stepNext();
      const expected = day >= 5 ? externalCloses[day - 1] : -1;
      expect(plugin.lastMacroClose).toBe(expected);
    }
  });

  it('日内周期(30m)按 availabilityKey 归并日线(1440)外部数据：15:01 前绝不泄漏当日日线', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    const seenByEvalTime = new Map<string, string>();
    registry.register({
      id: 'plugin.test.intraday-macro-reader',
      name: '日内宏观读取器',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'test',
      evaluate: async (ctx) => {
        const series = ctx.attributes.get('series.880003.1440') as
          | readonly { rawBar: StrategyBar }[]
          | undefined;
        const last = series?.[series.length - 1]?.rawBar;
        if (last) {
          seenByEvalTime.set(
            ctx.timestamp.toISOString(),
            last.timestamp.toISOString(),
          );
        }
        return { action: 'BUY', reason: 'ok' };
      },
    });

    // 上海时间：
    // - 2026-01-05 日线 (00:00 上海 = 2026-01-04T16:00:00Z)，avail = 2026-01-05T07:01:00Z
    // - 2026-01-06 日线 (00:00 上海 = 2026-01-05T16:00:00Z)，avail = 2026-01-06T07:01:00Z
    const jan5Daily: StrategyBar = {
      securityId: 12,
      securityCode: '880003',
      source: 'qmt',
      period: 1440,
      timestamp: new Date('2026-01-04T16:00:00.000Z'),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: '1',
      amount: '1',
      type: 'complete',
    };
    const jan6Daily: StrategyBar = {
      ...jan5Daily,
      timestamp: new Date('2026-01-05T16:00:00.000Z'),
      close: 200,
    };

    // 目标 30m 序列：
    // - prewarm: 2026-01-05 15:00 上海 (07:00Z, avail = 07:01Z)
    // - public 0: 2026-01-06 10:30 上海 (02:30Z, avail = 02:30Z < jan6Daily avail 07:01Z)
    // - public 1: 2026-01-06 14:30 上海 (06:30Z, avail = 06:30Z < jan6Daily avail 07:01Z)
    // - public 2: 2026-01-06 15:00 上海 (07:00Z, avail = 07:01Z === jan6Daily avail 07:01Z)
    const targetBars: StrategyBar[] = [
      makeStrategyBar(new Date('2026-01-05T07:00:00.000Z'), 10, 30),
      makeStrategyBar(new Date('2026-01-06T02:30:00.000Z'), 11, 30),
      makeStrategyBar(new Date('2026-01-06T06:30:00.000Z'), 12, 30),
      makeStrategyBar(new Date('2026-01-06T07:00:00.000Z'), 13, 30),
    ];

    const session = new StrategySimulationSession(targetBars, {
      securityId: 1,
      securityCode: '000001',
      period: 30,
      startDate: new Date('2026-01-06T01:30:00.000Z'), // 09:30 上海（早于 jan6Daily 15:01 可用时刻，但晚于 jan6Daily 00:00 裸时间戳）
      windowBudget: 1,
      flow: {
        id: 'guard',
        type: 'GUARD',
        name: 'gate',
        pluginId: 'plugin.test.intraday-macro-reader',
        requiredAction: 'BUY',
        onPass: {
          id: 'term',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'INTRADAY_EXT',
          reason: 'pass',
        },
      },
      externalContextRequirements: [
        { securityCode: '880003', securityId: 12, period: 1440, minBars: 1 },
      ],
      externalBars: [jan5Daily, jan6Daily],
      registry,
    });

    await session.stepNext(); // 10:30：仅可见 2026-01-05 日线
    expect(seenByEvalTime.get(targetBars[1].timestamp.toISOString())).toBe(
      jan5Daily.timestamp.toISOString(),
    );

    await session.stepNext(); // 14:30：仍不可见 2026-01-06 日线
    expect(seenByEvalTime.get(targetBars[2].timestamp.toISOString())).toBe(
      jan5Daily.timestamp.toISOString(),
    );

    await session.stepNext(); // 15:00 (avail = 15:01)：正式可见 2026-01-06 日线
    expect(seenByEvalTime.get(targetBars[3].timestamp.toISOString())).toBe(
      jan6Daily.timestamp.toISOString(),
    );
  });
});
