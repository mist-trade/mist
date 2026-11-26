import {
  buildTradingManual,
  formatPeriod,
  renderTraceChain,
} from './trading-manual';
import type { TradingDecision } from '@app/strategy';
import type { StrategySignal } from '@app/shared-data';

function signalEntity(overrides: Partial<StrategySignal> = {}): StrategySignal {
  return {
    id: 5,
    strategyDefinitionId: 3,
    strategyVersionId: 1,
    securityId: 9,
    period: 30,
    signalTime: new Date('2026-08-12T09:35:00+08:00'),
    signalKind: 'entry' as StrategySignal['signalKind'],
    signalType: 'CHAN_SECOND_BUY',
    contextSnapshot: {},
    ruleSnapshot: {},
    ...overrides,
  } as StrategySignal;
}

describe('buildTradingManual（REQ-MSG-01..03）', () => {
  const decision: TradingDecision = {
    instructions: [
      {
        instructionId: 'ti-evt-sell',
        idempotencyKey: 'evt-sell',
        action: 'SELL',
        quantity: 7500,
        referencePrice: 12.5,
        estimatedValueLi: 93_750_000n,
        reason: 'CHAN_SECOND_SELL',
        attribution: {
          strategyName: '全共振战术',
          periodLabel: '30m',
          traceChain: 'regime 门禁 ✓ → chan 二卖 ✓',
        },
      },
      {
        instructionId: 'ti-evt-buy',
        idempotencyKey: 'evt-buy',
        action: 'BUY',
        quantity: 7600,
        referencePrice: 12.34,
        estimatedValueLi: 93_784_000n,
        reason: 'CHAN_SECOND_BUY',
        attribution: {
          strategyName: '全共振战术',
          periodLabel: '30m',
          traceChain: null,
        },
      },
    ],
    rejections: [
      {
        idempotencyKey: 'evt-rej',
        signal: {
          idempotencyKey: 'evt-rej',
          signal: {
            definitionId: 3,
            versionId: 1,
            signalKind: 'exit',
            signalTime: new Date(),
            triggerPrice: 12.1,
            pivotTime: null,
            pivotPrice: null,
            signalType: 'DIVERGENCE_SELL',
            decisionTrace: {},
            contextSnapshot: {},
            ruleSnapshot: {},
          },
          attribution: {
            strategyName: '波动压制',
            periodLabel: '60m',
            traceChain: null,
          },
        },
        reason: 'NO_POSITION',
        detail: '虚拟账户空仓',
      },
    ],
    accountAfter: {
      cashLi: 906_250_000n,
      positions: new Map([
        [
          9,
          {
            securityId: 9,
            securityCode: '000001',
            holdingQuantity: 7500,
            costPriceLi: 12_500n,
            currentPriceLi: 12_500n,
            realizedPnlLi: 0n,
          },
        ],
      ]),
      tradingDay: '2026-08-12',
    },
  };

  it('账户快照头 + 指令行 + 拒绝行完整输出（REQ-MSG-01）', () => {
    const text = buildTradingManual({
      securityCode: '000001',
      securityName: '平安银行',
      effectiveTime: new Date('2026-08-12T01:35:00.000Z'),
      decision,
    });
    expect(text).toContain('[Mist 交易手册] 000001 平安银行');
    expect(text).toContain('可用 906,250');
    expect(text).toContain('持仓 7,500股 @ 12.50');
    expect(text).toContain('▶ 卖出 7,500股 @ 12.50 ≈ 93,750');
    expect(text).toContain('▶ 买入 7,600股 @ 12.34 ≈ 93,784');
    expect(text).toContain('✗ 卖出已拒绝：NO_POSITION（虚拟账户空仓）');
    // 归因随行（REQ-MSG-03，已移除置信度后缀）
    expect(text).toContain('全共振战术 30m CHAN_SECOND_BUY');
    expect(text).not.toContain('[HIGH');
    expect(text).toContain('regime 门禁 ✓ → chan 二卖 ✓');
    // 卖出指令先于买入（REQ-MSG-02）
    expect(text.indexOf('▶ 卖出')).toBeLessThan(text.indexOf('▶ 买入'));
  });

  it('空仓账户渲染「空仓」段', () => {
    const text = buildTradingManual({
      securityCode: '000001',
      securityName: '',
      effectiveTime: new Date('2026-08-12T01:35:00.000Z'),
      decision: {
        ...decision,
        accountAfter: { ...decision.accountAfter, positions: new Map() },
      },
    });
    expect(text).toContain('空仓');
  });

  it('renderTraceChain：紧凑链与空值回退', () => {
    expect(
      renderTraceChain(
        signalEntity({
          decisionTrace: {
            trace: [
              { pluginId: 'plugin.regime.shanghai-index', name: 'regime 门禁' },
              { pluginId: 'plugin.chan.bsp' },
            ],
          },
        }) as StrategySignal,
      ),
    ).toBe('regime 门禁 ✓ → chan 二卖 ✓'.replace('chan 二卖', 'chan.bsp'));
  });

  it('renderTraceChain：无 trace 返回 null', () => {
    expect(
      renderTraceChain(signalEntity({ decisionTrace: null }) as StrategySignal),
    ).toBeNull();
    expect(renderTraceChain(null)).toBeNull();
  });

  it('formatPeriod：分钟/小时/日线标签', () => {
    expect(formatPeriod(30)).toBe('30m');
    expect(formatPeriod(60)).toBe('1h');
    expect(formatPeriod(1440)).toBe('日线');
    expect(formatPeriod(undefined)).toBe('');
  });
});
