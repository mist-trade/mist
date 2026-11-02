import { StrategyEvaluationKernel } from './strategy-evaluation-kernel';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { FactorPlugin, FactorOpinion } from '../factor/factor.types';
import { shanghaiMidnightOf } from '../kernel/adapters/period-aggregation.helper';

/**
 * 回归守卫（时间戳约定三链路一致）：
 * 交易日 D 的日线戳 = shanghaiMidnightOf(D)（北京 D 00:00）。
 * hydration（存储约定）与实时派生（reduceDaily）同约定 →
 * 连续交易日戳严格递增，内核游标不误判乱序，逐日求值正常触发。
 */
class Echo implements FactorPlugin {
  public readonly id = 'p.echo';
  public readonly name = 'echo';
  public readonly category = 'TECHNICAL' as const;
  public readonly version = '1.0.0';
  public readonly description = 't';
  public readonly paramSchema = {};
  public calls = 0;
  public async evaluate(): Promise<FactorOpinion> {
    this.calls++;
    return { action: 'NEUTRAL', confidence: 0, reason: 'x' };
  }
}

it('daily stamp consistency: hydration + live-derived bars interleave without cursor drops', async () => {
  const plugin = new Echo();
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(plugin);
  const kernel = new StrategyEvaluationKernel({
    securityId: 1,
    securityCode: '000001',
    publicFrom: new Date(-8640000000000000),
    registry,
    plans: [
      {
        definitionId: 1,
        versionId: 1,
        flow: {
          id: 'g',
          type: 'GUARD',
          name: 'g',
          pluginId: 'p.echo',
          requiredAction: 'BUY',
          minConfidence: 0.1,
          onPass: {
            id: 't',
            type: 'TERMINAL',
            action: 'BUY',
            signalTag: 'X',
            reason: 'p',
          },
        },
        ruleSnapshot: {},
        period: 1440,
        requiredBarCount: 3,
        contextRequirements: {},
      },
    ],
  });
  const daily = (tradingDayISO: string, close: number) => ({
    securityId: 1,
    source: 'qmt' as const,
    period: 1440,
    timestamp: shanghaiMidnightOf(new Date(tradingDayISO)),
    open: close,
    high: close,
    low: close,
    close,
    volume: '1',
    amount: '1',
    type: 'complete' as const,
  });
  // hydration：交易日 11-02 ~ 11-04（存储约定戳）
  for (const [d, c] of [
    ['2026-11-02', 3638],
    ['2026-11-03', 3640],
    ['2026-11-04', 3645],
  ] as const) {
    await kernel.push(daily(d, c));
  }
  // 实时派生：交易日 11-05、11-06（reduceDaily 同约定戳）
  for (const [d, c] of [
    ['2026-11-05', 3650],
    ['2026-11-06', 3655],
  ] as const) {
    await kernel.push(daily(d, c));
  }
  // 窗口按预算(3)裁剪恒为 3 根；无乱序丢弃的证据 = 三根都触发了求值
  const diag = kernel.diagnostics();
  const win = diag.perPeriod.find((p) => p.period === 1440)?.windowSize;
  expect(win).toBe(3);
  expect(plugin.calls).toBe(3);
}, 30000);
