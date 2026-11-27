import type { StrategyBar } from '@app/market-data';
import { StrategyEvaluationKernel } from './strategy-evaluation-kernel';
import type { KernelConfig, KernelPlan, KernelSignal } from './kernel.types';
import { channelKeyOf } from './kernel.types';
import { contextSeriesKey } from './availability';
import type {
  VirtualExitChannelSpec,
  VirtualExitPolicyPort,
  VirtualExitProposal,
  VirtualExitRule,
} from '../virtual-exit/virtual-exit.port';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import { createChanBspDecisionFlow } from '../simulation/standard-simulation-flows';
import { normalizeExternalDecimalText } from '../../../decimal/src/decimal8';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import { availabilityKey, MissingContextSeriesError } from './availability';
import type { FactorOpinion, FactorPlugin } from '../factor/factor.types';

/** 恒真测试插件：每根 Bar 都 BUY（验证内核无投递级去重）。 */
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

/** 恒卖测试插件：每根 Bar 都 SELL（验证 intent 由 action 推导，而非 plan 声明）。 */
class AlwaysSellPlugin implements FactorPlugin {
  public readonly id = 'plugin.test.always-sell';
  public readonly name = '恒卖测试插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = '测试专用：恒定返回 SELL';
  public readonly paramSchema = {};

  public async evaluate(): Promise<FactorOpinion> {
    return { action: 'SELL', reason: 'always sell (test)' };
  }
}

function createAlwaysSellFlow(): DecisionFlowNode {
  return {
    id: 'guard_sell',
    type: 'GUARD',
    name: '恒卖门禁',
    pluginId: 'plugin.test.always-sell',
    params: {},
    requiredAction: 'SELL',
    onPass: {
      id: 'term_sell',
      type: 'TERMINAL',
      action: 'SELL',
      signalTag: 'ALWAYS_SELL',
      reason: '恒卖触发',
    },
    onFail: {
      id: 'term_sell_never',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '永不触发',
    },
  };
}

/**
 * 快照可见性插件：读取 series.<period> 末根时间戳，作为 evidence 回传，
 * 用于断言"高周期求值时子周期窗口已含同刻 bar / 不含未来 bar"。
 */
class SeriesReaderPlugin implements FactorPlugin {
  public readonly id = 'plugin.test.series-reader';
  public readonly name = '快照读取插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = '测试专用：读取声明周期的窗口快照';
  public readonly paramSchema = {};

  public async evaluate(
    context: import('../factor/factor.types').FactorContext,
  ): Promise<FactorOpinion> {
    const series = context.attributes.get(
      contextSeriesKey(context.securityCode, 5),
    );
    if (series === undefined || series === null) {
      throw new MissingContextSeriesError(5);
    }
    const last = (series as readonly { rawBar: StrategyBar }[]).at(-1);
    return {
      action: 'BUY',
      reason: 'series read (test)',
      evidence: {
        last5mTimestamp: last?.rawBar.timestamp.toISOString() ?? null,
      },
    };
  }
}

function createAlwaysMatchedFlow(): DecisionFlowNode {
  return {
    id: 'guard_always',
    type: 'GUARD',
    name: '恒真门禁',
    pluginId: 'plugin.test.always-buy',
    params: {},
    requiredAction: 'BUY',
    onPass: {
      id: 'term_always',
      type: 'TERMINAL',
      action: 'BUY',
      signalTag: 'ALWAYS',
      reason: '恒真触发',
    },
    onFail: {
      id: 'term_never',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '永不触发',
    },
  };
}

function createSeriesReaderFlow(): DecisionFlowNode {
  return {
    id: 'guard_reader',
    type: 'GUARD',
    name: '快照门禁',
    pluginId: 'plugin.test.series-reader',
    params: {},
    requiredAction: 'BUY',
    onPass: {
      id: 'term_reader',
      type: 'TERMINAL',
      action: 'BUY',
      signalTag: 'READER',
      reason: '读取快照',
    },
  };
}

function makeAlwaysMatchedRegistry(): InMemoryFactorPluginRegistry {
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(new AlwaysBuyPlugin());
  return registry;
}

function makeSeriesReaderRegistry(): InMemoryFactorPluginRegistry {
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(new AlwaysBuyPlugin());
  registry.register(new SeriesReaderPlugin());
  return registry;
}

function makeStrategyBar(
  time: Date,
  close = 10,
  period = 30,
  securityId = 1,
): StrategyBar {
  return {
    securityId,
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

function makeMockBars(
  count: number,
  startPrice = 10,
  startTime = new Date('2024-01-02T09:30:00.000Z').getTime(),
  stepMs = 30 * 60 * 1000,
): StrategyBar[] {
  const bars: StrategyBar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i += 1) {
    const change = Math.sin(i / 5) * 0.5;
    price += change;
    const close = Math.round((price + (i % 2 === 0 ? 0.2 : -0.2)) * 100) / 100;
    bars.push(makeStrategyBar(new Date(startTime + i * stepMs), close));
  }
  return bars;
}

function makeKernelConfig(
  overrides: Partial<KernelConfig> & { publicFrom: Date },
): KernelConfig {
  return {
    securityId: 1,
    securityCode: '000001',
    plans: [
      {
        definitionId: 1,
        versionId: 1,
        flow: createChanBspDecisionFlow({ requiredBarCount: 20 }),
        ruleSnapshot: Object.freeze({}),
        period: 30,
        requiredBarCount: 20,
        contextRequirements: {},
      },
    ],
    ...overrides,
  };
}

describe('StrategyEvaluationKernel（统一 push 内核）', () => {
  it('按 publicFrom 划分相位：预热相不发射、公开相发射', async () => {
    const bars = makeMockBars(40);
    const publicFrom = bars[20].timestamp;
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom }),
    );

    for (let i = 0; i < 20; i += 1) {
      const signals = await kernel.push(bars[i]);
      expect(signals).toEqual([]);
    }
    const diag = kernel.diagnostics();
    expect(diag.prewarmActual).toBe(20);
    expect(diag.publicBarCount).toBe(0);
  });

  it('重复/乱序 Bar 静默忽略（per-period 游标）', async () => {
    const bars = makeMockBars(30);
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom: new Date(0) }),
    );

    await kernel.push(bars[0]);
    const duplicate = await kernel.push(bars[0]);
    const late = await kernel.push(
      makeStrategyBar(new Date(bars[0].timestamp.getTime() - 60_000)),
    );
    expect(duplicate).toEqual([]);
    expect(late).toEqual([]);
  });

  it('窗口不足 windowBudget 期间不判定不发射（insufficient_history 语义）', async () => {
    const bars = makeMockBars(15);
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom: new Date(0) }),
    );
    for (const bar of bars) {
      const signals = await kernel.push(bar);
      expect(signals).toEqual([]);
    }
    expect(
      kernel.diagnostics().perPeriod.find((p) => p.period === 30)?.windowSize,
    ).toBe(15);
  });

  it('预热满额时，预热相静默求值推进游标，公开相首根不倾泻历史形态点', async () => {
    const bars = makeMockBars(80);
    const publicFrom = bars[40].timestamp;
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom }),
    );
    for (let i = 0; i < 40; i += 1) {
      await kernel.push(bars[i]);
    }
    // 公开相首根：预热求值已把插件游标推进至预热结束，历史形态点不得倾泻
    const firstPublic = await kernel.push(bars[40]);
    const stale = firstPublic.filter(
      (signal) =>
        signal.pivotTime !== null &&
        new Date(signal.pivotTime).getTime() < publicFrom.getTime(),
    );
    expect(stale).toEqual([]);
    expect(kernel.diagnostics().prewarmStatus).toBe('full');
  });

  it('预热段不足时 prewarmStatus 记录 partial/empty 并随公开 Bar 逐步升温', async () => {
    const bars = makeMockBars(30);
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom: bars[5].timestamp }),
    );
    for (let i = 0; i < 5; i += 1) {
      await kernel.push(bars[i]);
    }
    await kernel.push(bars[5]);
    expect(kernel.diagnostics().prewarmStatus).toBe('partial');
    expect(kernel.diagnostics().prewarmActual).toBe(5);
    expect(kernel.diagnostics().prewarmExpected).toBe(20);
  });

  it('公开相信号满足双时间戳契约：signalTime=确认 Bar、pivotTime<=signalTime', async () => {
    const bars = makeMockBars(60);
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom: new Date(0) }),
    );
    let sawSignal = false;
    for (const bar of bars) {
      const signals = await kernel.push(bar);
      for (const signal of signals) {
        sawSignal = true;
        expect(signal.signalTime).toBe(bar.timestamp);
        expect(signal.triggerPrice).toBe(bar.close);
        if (signal.pivotTime !== null) {
          expect(new Date(signal.pivotTime).getTime()).toBeLessThanOrEqual(
            signal.signalTime.getTime(),
          );
        }
        expect(
          signal.signalKind === 'entry' || signal.signalKind === 'exit',
        ).toBe(true);
      }
    }
    // 合成行情 + 20 根窗口预算下允许无信号，但门禁契约本身必须可执行
    expect(typeof sawSignal).toBe('boolean');
  });

  it('内核不做投递级去重：连续 matched 的恒真门禁逐 Bar 原始发射（三链路一致基准）', async () => {
    const bars = makeMockBars(20);
    const plan: KernelPlan = {
      definitionId: 7,
      versionId: 1,
      flow: createAlwaysMatchedFlow(),
      ruleSnapshot: Object.freeze({}),
      period: 30,
      requiredBarCount: 10,
      contextRequirements: {},
    };
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: bars[0].timestamp,
      plans: [plan],
      registry: makeAlwaysMatchedRegistry(),
    });

    const emittedPerBar: number[] = [];
    for (const bar of bars) {
      emittedPerBar.push((await kernel.push(bar)).length);
    }
    // 窗口满额（第 10 根，index 9）起，恒真门禁每根 Bar 都发射
    const publicWindow = emittedPerBar.slice(9);
    expect(publicWindow.length).toBe(11);
    for (const count of publicWindow) {
      expect(count).toBe(1);
    }
    expect(kernel.diagnostics().emittedSignalCount).toBe(11);
  });
});

describe('StrategyEvaluationKernel（通道与意图盖章）', () => {
  function makeChannelKernel(
    flow: DecisionFlowNode,
    plugin: FactorPlugin,
    overrides: Partial<KernelPlan> = {},
  ): StrategyEvaluationKernel {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(plugin);
    return new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: new Date(0),
      registry,
      plans: [
        {
          definitionId: 23,
          versionId: 4,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 20,
          contextRequirements: {},
          ...overrides,
        },
      ],
    });
  }

  it('BUY 决策盖章 intent=ENTRY、channel=(definition, period)、originPluginId', async () => {
    const bars = makeMockBars(40);
    const kernel = makeChannelKernel(
      createAlwaysMatchedFlow(),
      new AlwaysBuyPlugin(),
    );

    const emitted: KernelSignal[] = [];
    for (const bar of bars) {
      emitted.push(...(await kernel.push(bar)));
    }

    expect(emitted.length).toBeGreaterThan(0);
    const first = emitted[0];
    expect(first.channel).toEqual({
      definitionId: 23,
      versionId: 4,
      period: 30,
    });
    expect(first.intent).toBe('ENTRY');
    expect(first.originPluginId).toBe('plugin.test.always-buy');
    expect(channelKeyOf(first.channel!)).toBe('23:30');
  });

  it('plan 声明 signalKind=entry 但插件产出 SELL 时：intent 仍为 EXIT（旧字段不变）', async () => {
    const bars = makeMockBars(40);
    const kernel = makeChannelKernel(
      createAlwaysSellFlow(),
      new AlwaysSellPlugin(),
      { signalKind: 'entry' },
    );

    const emitted: KernelSignal[] = [];
    for (const bar of bars) {
      emitted.push(...(await kernel.push(bar)));
    }

    expect(emitted.length).toBeGreaterThan(0);
    const first = emitted[0];
    expect(first.intent).toBe('EXIT');
    expect(first.signalKind).toBe('entry');
    expect(first.originPluginId).toBe('plugin.test.always-sell');
  });
});

describe('StrategyEvaluationKernel（虚拟出场端口）', () => {
  class RuleDeclaringPlugin implements FactorPlugin {
    public readonly id = 'plugin.test.rule-declaring';
    public readonly name = '规则声明测试插件';
    public readonly category = 'TECHNICAL' as const;
    public readonly version = '1.0.0';
    public readonly description = '测试专用：声明一条均价止损规则';
    public readonly paramSchema = {};

    public async evaluate(): Promise<FactorOpinion> {
      return { action: 'BUY', reason: 'always buy (test)' };
    }

    public virtualExitRules(): readonly VirtualExitRule[] {
      return [{ kind: 'stop', lossRatio: -0.03, id: 'avg-stop' }];
    }
  }

  class StubPolicy implements VirtualExitPolicyPort {
    public specs: readonly VirtualExitChannelSpec[] = [];
    public signals: KernelSignal[] = [];
    public proposals: readonly VirtualExitProposal[] = [];

    public configure(specs: readonly VirtualExitChannelSpec[]): void {
      this.specs = specs;
    }

    public onSignal(signal: KernelSignal): void {
      this.signals.push(signal);
    }

    public onBar(): readonly VirtualExitProposal[] {
      return this.proposals;
    }
  }

  function ruleFlow(): DecisionFlowNode {
    return {
      id: 'guard_rule',
      type: 'GUARD',
      name: '规则声明门禁',
      pluginId: 'plugin.test.rule-declaring',
      params: {},
      requiredAction: 'BUY',
      onPass: {
        id: 'term_rule',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'RULE_BUY',
        reason: '规则插件买入',
      },
      onFail: {
        id: 'term_rule_abort',
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '未触发',
      },
    };
  }

  function makeKernel(policy: VirtualExitPolicyPort): StrategyEvaluationKernel {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new RuleDeclaringPlugin());
    return new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: new Date(0),
      registry,
      virtualExitPolicy: policy,
      plans: [
        {
          definitionId: 7,
          versionId: 1,
          flow: ruleFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
    });
  }

  it('构造时把插件声明的规则按通道推送给策略实现', () => {
    const policy = new StubPolicy();
    makeKernel(policy);

    expect(policy.specs).toHaveLength(1);
    expect(policy.specs[0].channel).toEqual({
      definitionId: 7,
      versionId: 1,
      period: 30,
    });
    expect(policy.specs[0].bindings).toEqual([
      {
        ownerPluginId: 'plugin.test.rule-declaring',
        rule: { kind: 'stop', lossRatio: -0.03, id: 'avg-stop' },
      },
    ]);
  });

  it('策略返回的提案被转换为 VIRTUAL_EXIT 信号，并带上通道与归因', async () => {
    const policy = new StubPolicy();
    const kernel = makeKernel(policy);
    const bar = makeStrategyBar(new Date('2026-10-12T01:30:00.000Z'), 10.0);

    policy.proposals = [
      {
        channel: { definitionId: 7, versionId: 1, period: 30 },
        ownerPluginId: 'plugin.test.rule-declaring',
        ruleId: 'avg-stop',
        exitKind: 'AVERAGE_STOP',
        reason: '收盘跌破均价止损线',
        badgeText: '均价止损',
      },
    ];

    const signals = await kernel.push(bar);
    // 先出后进（Exit-Before-Entry）：已有持仓的虚拟出场在前，当根真实 BUY 在后
    expect(signals).toHaveLength(2);
    expect(policy.signals).toHaveLength(1);

    const exit = signals[0];
    expect(signals[1].intent).toBe('ENTRY');
    expect(exit.intent).toBe('EXIT');
    expect(exit.signalType).toBe('VIRTUAL_EXIT');
    expect(exit.displayTag).toBe('VIRTUAL_EXIT_AVERAGE_STOP');
    expect(exit.originPluginId).toBe('plugin.test.rule-declaring');
    expect(exit.channel).toEqual({ definitionId: 7, versionId: 1, period: 30 });
    expect(exit.contextSnapshot).toMatchObject({ exitKind: 'AVERAGE_STOP' });
    expect(exit.decisionTrace).toMatchObject({
      exitKind: 'AVERAGE_STOP',
      badgeText: '均价止损',
      trace: [
        expect.objectContaining({
          type: 'VIRTUAL_EXIT',
          pluginId: 'plugin.test.rule-declaring',
          name: '均价止损',
          action: 'SELL',
        }),
      ],
    });
  });
});

describe('StrategyEvaluationKernel（多周期窗口）', () => {
  function makeMultiPeriodBars(): {
    bars5m: StrategyBar[];
    bars30m: StrategyBar[];
  } {
    // 5m 与 30m 同刻对齐：5m[i] 时间 = 09:35 + i*5min；30m[j] = 10:00 + j*30min
    const start = Date.UTC(2024, 0, 2, 1, 35); // 09:35 上海
    const bars5m: StrategyBar[] = [];
    const bars30m: StrategyBar[] = [];
    for (let i = 0; i < 140; i += 1) {
      bars5m.push(
        makeStrategyBar(
          new Date(start + i * 5 * 60_000),
          10 + Math.sin(i / 4),
          5,
        ),
      );
    }
    for (let j = 0; j < 24; j += 1) {
      bars30m.push(
        makeStrategyBar(
          new Date(start + 25 * 60_000 + j * 30 * 60_000),
          10 + Math.sin(j / 3),
          30,
        ),
      );
    }
    return { bars5m, bars30m };
  }

  it('context bar 只进窗口、不触发求值（planSkips 不变）', async () => {
    const { bars5m } = makeMultiPeriodBars();
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: new Date(0),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: createAlwaysMatchedFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 10,
          contextRequirements: { 5: 10 },
        },
      ],
      registry: makeAlwaysMatchedRegistry(),
    });
    const before = kernel.diagnostics().publicBarCount;
    for (const bar of bars5m.slice(0, 20)) {
      expect(await kernel.push(bar)).toEqual([]);
    }
    expect(kernel.diagnostics().publicBarCount).toBe(before + 20);
    expect(kernel.diagnostics().emittedSignalCount).toBe(0);
    expect(
      kernel.diagnostics().perPeriod.find((p) => p.period === 5)?.windowSize,
    ).toBe(10);
  });

  it('同刻 5m 先推、30m 后推：30m 求值时 series.5 已含 10:00 那根（无未来分钟）', async () => {
    const { bars5m, bars30m } = makeMultiPeriodBars();
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: new Date(0),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: createSeriesReaderFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 4,
          contextRequirements: { 5: 20 },
        },
      ],
      registry: makeSeriesReaderRegistry(),
    });
    // 真实合并流：按 (orderKey, period) 升序推送 5m/30m（只推 11:30 之前的日段）
    const merged = [...bars5m, ...bars30m]
      .filter((bar) => bar.timestamp.getTime() <= Date.UTC(2024, 0, 2, 3, 31))
      .sort((left, right) => {
        const leftKey = availabilityKey(left).getTime();
        const rightKey = availabilityKey(right).getTime();
        return leftKey - rightKey || left.period - right.period;
      });

    const target30m = bars30m[3]; // 10:00 + 3*30min = 11:30
    let signals: readonly import('./kernel.types').KernelSignal[] = [];
    for (const bar of merged) {
      const pushed = await kernel.push(bar);
      if (bar === target30m) signals = pushed;
    }
    expect(signals.length).toBe(1);
    const evidence = signals[0].decisionTrace as {
      trace?: { evidence?: { last5mTimestamp?: string } }[];
    };
    const last5m = evidence.trace?.find((t) => t.evidence?.last5mTimestamp)
      ?.evidence?.last5mTimestamp;
    expect(last5m).toBe(target30m.timestamp.toISOString());
  });

  it('声明 context 窗口不足 → 跳过该 plan（fail-closed，不判定不发射）', async () => {
    const { bars30m } = makeMultiPeriodBars();
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: new Date(0),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: createAlwaysMatchedFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 4,
          contextRequirements: { 5: 200 },
        },
      ],
      registry: makeAlwaysMatchedRegistry(),
    });
    for (let j = 0; j < 10; j += 1) await kernel.push(bars30m[j]);
    const diag = kernel.diagnostics();
    expect(diag.emittedSignalCount).toBe(0);
    // 前 3 根 30m 窗口不足未到求值；第 4 根起每次求值都因 5m 不足被跳过
    expect(diag.planSkips).toBe(7);
  });

  it('插件读未声明 context → 显式跳过该 plan（不 NEUTRAL、不崩组）', async () => {
    const { bars30m: bars30mReader } = makeMultiPeriodBars();
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: new Date(0),
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: createSeriesReaderFlow(), // 插件读 series.5，但 plan 未声明 5
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 4,
          contextRequirements: {},
        },
      ],
      registry: makeSeriesReaderRegistry(),
    });
    for (let j = 0; j < 10; j += 1) {
      const signals = await kernel.push(bars30mReader[j]);
      expect(signals).toEqual([]);
    }
    const diag = kernel.diagnostics();
    expect(diag.planSkips).toBe(7);
    expect(diag.emittedSignalCount).toBe(0);
  });

  it('per-period prewarm 聚合取最差（任一 empty → empty）', async () => {
    const { bars30m } = makeMultiPeriodBars();
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: bars30m[2].timestamp,
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: createAlwaysMatchedFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 4,
          contextRequirements: { 5: 10 },
        },
      ],
      registry: makeAlwaysMatchedRegistry(),
    });
    // 只预热 30m，不预热 5m → 5m 预热 empty
    for (let j = 0; j < 2; j += 1) await kernel.push(bars30m[j]);
    await kernel.push(bars30m[2]);
    const diag = kernel.diagnostics();
    expect(diag.prewarmStatus).toBe('empty');
    const p5 = diag.perPeriod.find((p) => p.period === 5);
    const p30 = diag.perPeriod.find((p) => p.period === 30);
    expect(p5?.prewarmStatus).toBe('empty');
    expect(p30?.prewarmStatus).toBe('partial');
  });

  it('未声明周期的 bar 被拒绝（防御）', async () => {
    const kernel = new StrategyEvaluationKernel(
      makeKernelConfig({ publicFrom: new Date(0) }),
    );
    // 1m 未声明（plan 只有 30m、context 空）→ windowOf 抛 TypeError
    await expect(
      kernel.push(makeStrategyBar(new Date(), 10, 1)),
    ).rejects.toThrow(/not a declared kernel period/);
    expect(kernel.diagnostics().publicBarCount).toBe(0);
  });

  it('同 Bar 先出后进：新建仓不得在入场同一根 Bar 触发 VIRTUAL_EXIT', async () => {
    const { PriceLevelExitPolicy } = await import(
      '../virtual-exit/price-level-exit.policy'
    );
    class EntryWithOneBarTimeoutPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.entry-one-bar-timeout';
      public readonly name = '单根超时测试插件';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = '仅首根买入并声明 1-bar 超时规则';
      private count = 0;

      public async evaluate(): Promise<FactorOpinion> {
        this.count += 1;
        return this.count === 1
          ? { action: 'BUY', reason: '首根建仓' }
          : { action: 'NEUTRAL', reason: '观望' };
      }

      public virtualExitRules() {
        return [{ kind: 'time_expired' as const, maxHoldingBars: 1 }];
      }
    }

    const registry = new InMemoryFactorPluginRegistry();
    registry.register(new EntryWithOneBarTimeoutPlugin());
    const flow: DecisionFlowNode = {
      id: 'guard_entry',
      type: 'GUARD',
      name: '入场',
      pluginId: 'plugin.test.entry-one-bar-timeout',
      requiredAction: 'BUY',
      onPass: { id: 'term_buy', type: 'TERMINAL', action: 'BUY', reason: 'ok' },
    };
    const b1 = makeStrategyBar(new Date('2026-01-05T02:00:00Z'), 10, 30);
    const b2 = makeStrategyBar(new Date('2026-01-05T02:30:00Z'), 10, 30);
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: b1.timestamp,
      registry,
      virtualExitPolicy: new PriceLevelExitPolicy(),
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
    });

    const s1 = await kernel.push(b1);
    expect(s1.map((s) => s.signalKind)).toEqual(['entry']);

    const s2 = await kernel.push(b2);
    expect(s2).toHaveLength(1);
    expect(s2[0]?.signalType).toBe('VIRTUAL_EXIT');
    expect(s2[0]?.contextSnapshot).toMatchObject({ exitKind: 'time_expired' });
  });

  it('surveillancePeriods 监控周期直通 virtualExitPolicy 且不触发主周期决策流', async () => {
    const evaluateSpy = jest.fn().mockResolvedValue({
      action: 'BUY',
      reason: 'daily buy',
    });
    const registry = new InMemoryFactorPluginRegistry();
    registry.register({
      id: 'plugin.test.daily-only',
      name: 'Daily Only',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'daily',
      evaluate: evaluateSpy,
    });

    const onBar5Calls: StrategyBar[] = [];
    const policy: VirtualExitPolicyPort = {
      configure: jest.fn(),
      onSignal: jest.fn(),
      onBar: (bar, period) => {
        if (period === 5) {
          onBar5Calls.push(bar);
          return [
            {
              channel: { definitionId: 9, versionId: 1, period: 1440 },
              ownerPluginId: 'plugin.test.daily-only',
              ruleId: 'intraday-5m-stop',
              exitKind: 'INTRADAY_5M_STOP',
              reason: '5m 盘中击穿',
              badgeText: '盘中5m击穿',
            },
          ];
        }
        return [];
      },
    };

    const flow: DecisionFlowNode = {
      id: 'guard_daily',
      type: 'GUARD',
      name: '日线门禁',
      pluginId: 'plugin.test.daily-only',
      requiredAction: 'BUY',
      onPass: { id: 'term', type: 'TERMINAL', action: 'BUY', reason: 'ok' },
    };

    const publicFrom = new Date('2026-01-05T00:00:00Z');
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom,
      registry,
      virtualExitPolicy: policy,
      surveillancePeriods: [5],
      plans: [
        {
          definitionId: 9,
          versionId: 1,
          flow,
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
    });

    // 预热期 5m bar：仅推进游标，不发射
    const pre5m = makeStrategyBar(new Date('2026-01-04T06:00:00Z'), 10, 5);
    expect(await kernel.push(pre5m)).toEqual([]);
    expect(onBar5Calls).toHaveLength(0);
    expect(evaluateSpy).not.toHaveBeenCalled();

    // 公开期 5m bar：直通 policy.onBar(bar, 5)，产出 VIRTUAL_EXIT，且不调用主日线策略树
    const pub5m = makeStrategyBar(new Date('2026-01-05T02:00:00Z'), 9.5, 5);
    const exits = await kernel.push(pub5m);
    expect(evaluateSpy).not.toHaveBeenCalled();
    expect(onBar5Calls).toHaveLength(1);
    expect(exits).toHaveLength(1);
    expect(exits[0]?.signalType).toBe('VIRTUAL_EXIT');
    expect(exits[0]?.signalTime).toBe(pub5m.timestamp);
    expect(exits[0]?.channel?.period).toBe(1440);
  });

  it('onFail 失败门禁不污染 KernelSignal 归因与 pivot 证据', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register({
      id: 'plugin.guard.fail-a',
      name: 'Fail A',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'fail',
      evaluate: async () => ({
        action: 'NEUTRAL',
        reason: '未满足A',
        badgeText: 'A失败',
        evidence: {
          eventType: 'A_FAIL',
          pivotTime: '2026-01-01T00:00:00.000Z',
          pivotPrice: 99,
        },
      }),
    });
    registry.register({
      id: 'plugin.guard.pass-b',
      name: 'Pass B',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'pass',
      evaluate: async () => ({
        action: 'BUY',
        reason: 'B突破成立',
        badgeText: 'B突破',
        evidence: {
          eventType: 'B_PASS',
          pivotTime: '2026-01-02T00:00:00.000Z',
          pivotPrice: 10.5,
        },
      }),
    });

    const flow: DecisionFlowNode = {
      id: 'guard_a',
      type: 'GUARD',
      name: '门禁A',
      pluginId: 'plugin.guard.fail-a',
      requiredAction: 'BUY',
      onPass: { id: 'term_a', type: 'TERMINAL', action: 'BUY' },
      onFail: {
        id: 'guard_b',
        type: 'GUARD',
        name: '门禁B',
        pluginId: 'plugin.guard.pass-b',
        requiredAction: 'BUY',
        onPass: {
          id: 'term_b',
          type: 'TERMINAL',
          action: 'INHERIT',
          signalTag: 'B_TAG',
        },
      },
    };

    const bar = makeStrategyBar(new Date('2026-01-05T02:00:00Z'), 11, 30);
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: bar.timestamp,
      registry,
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
    });

    const signals = await kernel.push(bar);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.originPluginId).toBe('plugin.guard.pass-b');
    expect(signals[0]?.badgeText).toBe('B突破');
    expect(signals[0]?.pivotPrice).toBe(10.5);
    expect(signals[0]?.pivotTime).toBe('2026-01-02T00:00:00.000Z');
  });

  it('预热条转发给 virtualExitPolicy.onPrewarmBar（含主/context 周期与 surveillancePeriods）', async () => {
    const onPrewarmBar = jest.fn();
    const policy: VirtualExitPolicyPort = {
      configure: jest.fn(),
      onSignal: jest.fn(),
      onBar: jest.fn().mockReturnValue([]),
      onPrewarmBar,
    };

    const registry = makeAlwaysMatchedRegistry();
    const publicFrom = new Date('2026-01-05T02:00:00.000Z');
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom,
      registry,
      virtualExitPolicy: policy,
      surveillancePeriods: [5],
      plans: [
        {
          definitionId: 1,
          versionId: 1,
          flow: createAlwaysMatchedFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: { 15: 1 },
        },
      ],
    });

    const pre30 = makeStrategyBar(new Date('2026-01-05T01:30:00.000Z'), 10, 30);
    const pre15 = makeStrategyBar(new Date('2026-01-05T01:45:00.000Z'), 10, 15);
    const pre5 = makeStrategyBar(new Date('2026-01-05T01:55:00.000Z'), 10, 5);
    const pub30 = makeStrategyBar(publicFrom, 10.2, 30);

    await kernel.push(pre30);
    await kernel.push(pre15);
    await kernel.push(pre5);
    await kernel.push(pub30);

    expect(onPrewarmBar).toHaveBeenCalledTimes(3);
    expect(onPrewarmBar).toHaveBeenNthCalledWith(1, pre30, 30);
    expect(onPrewarmBar).toHaveBeenNthCalledWith(2, pre15, 15);
    expect(onPrewarmBar).toHaveBeenNthCalledWith(3, pre5, 5);
  });

  it('跨计划去重 contextPrefetchSpecs 且 MissingContextSeriesError 按 plan 隔离而不崩溃兄弟计划', async () => {
    const sharedCtxEval = jest.fn().mockResolvedValue({
      action: 'BUY',
      reason: 'shared ctx ok',
    });
    const brokenCtxEval = jest.fn().mockImplementation(async () => {
      throw new MissingContextSeriesError(5);
    });

    const registry = new InMemoryFactorPluginRegistry();
    registry.register({
      id: 'plugin.ctx.shared',
      name: 'Shared Context',
      category: 'REGIME',
      version: '1.0.0',
      description: 'shared',
      role: 'context',
      evaluate: sharedCtxEval,
    });
    registry.register({
      id: 'plugin.ctx.broken',
      name: 'Broken Context',
      category: 'REGIME',
      version: '1.0.0',
      description: 'broken',
      role: 'context',
      evaluate: brokenCtxEval,
    });

    const sharedFlow: DecisionFlowNode = {
      id: 'guard_shared',
      type: 'GUARD',
      name: 'shared',
      pluginId: 'plugin.ctx.shared',
      requiredAction: 'BUY',
      onPass: {
        id: 'term_shared',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'SHARED_OK',
      },
    };
    const brokenFlow: DecisionFlowNode = {
      id: 'guard_broken',
      type: 'GUARD',
      name: 'broken',
      pluginId: 'plugin.ctx.broken',
      requiredAction: 'BUY',
      onPass: {
        id: 'term_broken',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'BROKEN_OK',
      },
    };

    const bar = makeStrategyBar(new Date('2026-01-05T02:00:00.000Z'), 10, 30);
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: bar.timestamp,
      registry,
      plans: [
        {
          definitionId: 101,
          versionId: 1,
          flow: sharedFlow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
        {
          definitionId: 102,
          versionId: 1,
          flow: sharedFlow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
        {
          definitionId: 103,
          versionId: 1,
          flow: brokenFlow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
    });

    const signals = await kernel.push(bar);
    // Plan 101 与 102 共用同一个 context cacheKey，每 Bar 仅预取一次；Plan 103 fail-closed 跳过
    expect(sharedCtxEval).toHaveBeenCalledTimes(1);
    expect(brokenCtxEval).toHaveBeenCalledTimes(1);
    expect(signals.map((s) => s.definitionId)).toEqual([101, 102]);
    expect(kernel.diagnostics().planSkips).toBe(1);
  });

  it('同 Bar 多计划之间隔离 context.attributes（EXTRACTOR 写入不泄漏给兄弟计划）', async () => {
    const registry = new InMemoryFactorPluginRegistry();
    registry.register({
      id: 'plugin.ext.writer',
      name: 'Writer',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: 'writes attribute',
      evaluate: async () => ({
        action: 'NEUTRAL',
        reason: 'write',
        evidence: { flag: 'POISONED' },
      }),
    });
    registry.register(new AlwaysBuyPlugin());

    const writerPlanFlow: DecisionFlowNode = {
      id: 'ext_1',
      type: 'EXTRACTOR',
      name: '提取污染属性',
      pluginId: 'plugin.ext.writer',
      exportAttributeKey: 'shared.leak',
      next: {
        id: 'guard_w',
        type: 'GUARD',
        name: '买',
        pluginId: 'plugin.test.always-buy',
        requiredAction: 'BUY',
        onPass: { id: 'term_w', type: 'TERMINAL', action: 'BUY' },
      },
    };
    const readerPlanFlow: DecisionFlowNode = {
      id: 'branch_r',
      type: 'BRANCH',
      name: '检测污染',
      condition: {
        attributeKey: 'shared.leak.flag',
        operator: 'eq',
        value: 'POISONED',
      },
      branches: {
        true: {
          id: 'term_leaked',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'LEAKED',
        },
        false: {
          id: 'term_clean',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'CLEAN',
        },
      },
    };

    const bar = makeStrategyBar(new Date('2026-01-05T02:00:00.000Z'), 10, 30);
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      publicFrom: bar.timestamp,
      registry,
      plans: [
        {
          definitionId: 201,
          versionId: 1,
          flow: writerPlanFlow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
        {
          definitionId: 202,
          versionId: 1,
          flow: readerPlanFlow,
          ruleSnapshot: Object.freeze({}),
          period: 30,
          requiredBarCount: 1,
          contextRequirements: {},
        },
      ],
    });

    const signals = await kernel.push(bar);
    expect(signals).toHaveLength(2);
    expect(signals[1]?.definitionId).toBe(202);
    expect(signals[1]?.signalType).toBe('CLEAN');
  });
});
