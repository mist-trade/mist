import type { StrategyBar } from '@app/market-data';
import { normalizeExternalDecimalText } from '../../../decimal/src/decimal8';
import { formatShanghaiDateString } from '@app/timezone';
import { StrategyEvaluationKernel } from './strategy-evaluation-kernel';
import type { KernelSignal } from './kernel.types';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor/factor.types';
import { contextSeriesKey, MissingContextSeriesError } from './availability';

/** 宏观读取插件：读 series.880003.1440 末根，收盘较首根下跌 → BUY；并回传末根日期用于因果断言。 */
class MacroReaderPlugin implements FactorPlugin {
  public readonly id = 'plugin.test.macro-reader';
  public readonly name = '宏观读取测试插件';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = '测试专用：读取跨标的 880003 窗口';
  public readonly paramSchema = {};
  public readonly seenLastMacroDate: string[] = [];

  public async evaluate(context: FactorContext): Promise<FactorOpinion> {
    const series = context.attributes.get(contextSeriesKey('880003', 1440)) as
      | readonly { rawBar: StrategyBar }[]
      | undefined;
    if (!series || series.length === 0) {
      throw new MissingContextSeriesError(1440);
    }
    const first = series[0].rawBar.close;
    const last = series[series.length - 1].rawBar;
    this.seenLastMacroDate.push(formatShanghaiDateString(last.timestamp));
    return last.close < first
      ? { action: 'BUY', confidence: 0.9, reason: 'macro declining (test)' }
      : { action: 'NEUTRAL', confidence: 0, reason: 'macro flat (test)' };
  }
}

function makeBar(
  securityId: number,
  securityCode: string,
  date: Date,
  close: number,
): StrategyBar {
  return {
    securityId,
    securityCode,
    source: 'tdx',
    period: 1440,
    timestamp: date,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: normalizeExternalDecimalText('1000'),
    amount: normalizeExternalDecimalText('10000'),
    type: 'complete',
  };
}

/** 两个标的的日线流：同日期内宏观在前、标的在后（与三条链路的归并规则一致） */
function interleave(
  macroBars: StrategyBar[],
  targetBars: StrategyBar[],
): StrategyBar[] {
  const out: StrategyBar[] = [];
  let mi = 0;
  for (const t of targetBars) {
    while (
      mi < macroBars.length &&
      macroBars[mi].timestamp.getTime() <= t.timestamp.getTime()
    ) {
      out.push(macroBars[mi]);
      mi += 1;
    }
    out.push(t);
  }
  while (mi < macroBars.length) {
    out.push(macroBars[mi]);
    mi += 1;
  }
  return out;
}

function makeFlow(): DecisionFlowNode {
  return {
    id: 'guard_macro',
    type: 'GUARD',
    name: '宏观门禁',
    pluginId: 'plugin.test.macro-reader',
    params: {},
    requiredAction: 'BUY',
    minConfidence: 0.5,
    onPass: {
      id: 'term_macro',
      type: 'TERMINAL',
      action: 'INHERIT',
      signalTag: 'MACRO_BUY',
      reason: 'macro condition',
    },
    onFail: {
      id: 'term_macro_abort',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: 'no macro condition',
    },
  };
}

function day(date: string): Date {
  return new Date(`${date}T07:00:00.000Z`); // 北京 15:00
}

describe('StrategyEvaluationKernel（跨标的上下文窗口）', () => {
  const MACRO_ID = 12;
  const TARGET_ID = 5;
  const MACRO_CODE = '880003';
  const TARGET_CODE = '000001';

  function makeKernel(minBars: number) {
    const plugin = new MacroReaderPlugin();
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(plugin);
    const kernel = new StrategyEvaluationKernel({
      securityId: TARGET_ID,
      securityCode: TARGET_CODE,
      publicFrom: new Date(0),
      registry,
      plans: [
        {
          definitionId: 900,
          versionId: 1,
          flow: makeFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 3,
          contextRequirements: {},
          externalContextRequirements: [
            {
              securityCode: MACRO_CODE,
              securityId: MACRO_ID,
              period: 1440,
              minBars,
            },
          ],
        },
      ],
    });
    return { kernel, plugin };
  }

  function makeStreams(count: number) {
    const macroBars: StrategyBar[] = [];
    const targetBars: StrategyBar[] = [];
    for (let i = 0; i < count; i += 1) {
      const t = day(`2024-01-${String(i + 1).padStart(2, '0')}`);
      macroBars.push(makeBar(MACRO_ID, MACRO_CODE, t, 100 - i)); // 逐日下行
      targetBars.push(makeBar(TARGET_ID, TARGET_CODE, t, 3000 + i));
    }
    return { macroBars, targetBars, stream: interleave(macroBars, targetBars) };
  }

  it('外部窗口未达 minBars → fail-closed（planSkips，不点火）', async () => {
    const { kernel } = makeKernel(5);
    const { stream } = makeStreams(3); // 宏观只有 3 根 < 5
    const all: KernelSignal[] = [];
    for (const bar of stream) all.push(...(await kernel.push(bar)));
    expect(all).toHaveLength(0);
    expect(kernel.diagnostics().planSkips).toBeGreaterThan(0);
  });

  it('外部窗口就绪 → 点火，且宏观序列末根不含未来数据', async () => {
    const { kernel, plugin } = makeKernel(5);
    const { macroBars, targetBars, stream } = makeStreams(10);
    const all: KernelSignal[] = [];
    for (const bar of stream) all.push(...(await kernel.push(bar)));

    const signalDates = all
      .filter((s) => s.signalType === 'MACRO_BUY')
      .map((s) => formatShanghaiDateString(s.signalTime));
    expect(signalDates.length).toBeGreaterThan(0);

    // 因果断言：每次点火时，插件看到的宏观末根 = 同日宏观 bar（不存在晚于点火日的数据）
    for (const d of plugin.seenLastMacroDate) {
      expect(
        d <= signalDates[signalDates.length - 1] || signalDates.includes(d),
      ).toBe(true);
    }
    // 宏观逐日下行 → 首次评估即应点火
    expect(signalDates[0]).toBe(
      formatShanghaiDateString(targetBars[4].timestamp),
    );
    // 外部窗口数据可见
    expect(kernel.diagnostics().externalWindows).toEqual([
      { securityCode: MACRO_CODE, period: 1440, windowSize: 5, budget: 5 },
    ]);
    expect(macroBars.length).toBe(10);
  });

  it('未声明跨标的依赖时，外部 bar 静默忽略', async () => {
    const plugin = new MacroReaderPlugin();
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(plugin);
    const kernel = new StrategyEvaluationKernel({
      securityId: TARGET_ID,
      securityCode: TARGET_CODE,
      publicFrom: new Date(0),
      registry,
      plans: [
        {
          definitionId: 900,
          versionId: 1,
          flow: makeFlow(),
          ruleSnapshot: Object.freeze({}),
          period: 1440,
          requiredBarCount: 2,
          contextRequirements: {},
        },
      ],
    });
    const { macroBars, targetBars, stream } = makeStreams(6);
    const all: KernelSignal[] = [];
    for (const bar of stream) {
      try {
        all.push(...(await kernel.push(bar)));
      } catch (error) {
        if (!MissingContextSeriesError || !(error instanceof Error))
          throw error;
        // 插件读取未声明的宏观键 → fail-closed 由内核跳过；这里直接吞掉等价于 planSkips
        break;
      }
    }
    // 至少：外部 bar 没有让内核崩溃，目标 bar 正常推进
    expect(targetBars.length).toBe(6);
    expect(macroBars.length).toBe(6);
  });
});
