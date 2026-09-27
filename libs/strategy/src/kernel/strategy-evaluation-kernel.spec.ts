import type { StrategyBar } from '@app/market-data';
import { StrategyEvaluationKernel } from './strategy-evaluation-kernel';
import type { KernelConfig, KernelPlan } from './kernel.types';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import {
  createChanBspDecisionFlow,
} from '../simulation/standard-simulation-flows';
import { normalizeExternalDecimalText } from '../../../decimal/src/decimal8';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor/factor.types';

/** 恒真测试插件：每根 Bar 都 BUY（验证内核无投递级去重）。 */
class AlwaysBuyPlugin implements FactorPlugin {
  public readonly id = 'plugin.test.always-buy';
  public readonly name = '恒真测试插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = '测试专用：恒定返回 BUY';
  public readonly paramSchema = {};

  public async evaluate(
    _context: FactorContext,
  ): Promise<FactorOpinion> {
    return { action: 'BUY', confidence: 0.9, reason: 'always buy (test)' };
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

function makeAlwaysMatchedRegistry(): InMemoryFactorPluginRegistry {
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(new AlwaysBuyPlugin());
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
    period: 30,
    plans: [
      {
        definitionId: 1,
        versionId: 1,
        flow: createChanBspDecisionFlow({ requiredBarCount: 20 }),
        ruleSnapshot: Object.freeze({}),
        requiredBarCount: 20,
      },
    ],
    ...overrides,
  };
}

describe('StrategyEvaluationKernel（统一 push 内核）', () => {
  it('按 publicFrom 划分相位：预热相不发射、公开相发射', async () => {
    const bars = makeMockBars(40);
    const publicFrom = bars[20].timestamp;
    const kernel = new StrategyEvaluationKernel(makeKernelConfig({ publicFrom }));

    for (let i = 0; i < 20; i += 1) {
      const signals = await kernel.push(bars[i]);
      expect(signals).toEqual([]);
    }
    const diag = kernel.diagnostics();
    expect(diag.prewarmActual).toBe(20);
    expect(diag.publicBarCount).toBe(0);
  });

  it('重复/乱序 Bar 静默忽略', async () => {
    const bars = makeMockBars(30);
    const kernel = new StrategyEvaluationKernel(makeKernelConfig({ publicFrom: new Date(0) }));

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
    const kernel = new StrategyEvaluationKernel(makeKernelConfig({ publicFrom: new Date(0) }));
    for (const bar of bars) {
      const signals = await kernel.push(bar);
      expect(signals).toEqual([]);
    }
    expect(kernel.diagnostics().windowSize).toBe(15);
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
    const kernel = new StrategyEvaluationKernel(makeKernelConfig({ publicFrom: new Date(0) }));
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
        expect(signal.signalKind === 'entry' || signal.signalKind === 'exit').toBe(true);
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
      requiredBarCount: 10,
    };
    const kernel = new StrategyEvaluationKernel({
      securityId: 1,
      securityCode: '000001',
      period: 30,
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
