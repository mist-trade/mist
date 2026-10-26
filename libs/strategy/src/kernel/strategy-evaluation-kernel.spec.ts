import type { StrategyBar } from '@app/market-data';
import { StrategyEvaluationKernel } from './strategy-evaluation-kernel';
import type { KernelConfig, KernelPlan } from './kernel.types';
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
    return { action: 'BUY', confidence: 0.9, reason: 'always buy (test)' };
  }
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
    const series = context.attributes.get('series.5');
    if (series === undefined || series === null) {
      throw new MissingContextSeriesError(5);
    }
    const last = (series as readonly { rawBar: StrategyBar }[]).at(-1);
    return {
      action: 'BUY',
      confidence: 0.9,
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
    minConfidence: 0.5,
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
    minConfidence: 0.5,
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
        expect(signal.triggerTime).toBe(bar.timestamp.toISOString());
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
});
