import type { StrategyBar } from '@app/market-data';
import { StrategyEvaluationKernel } from '../kernel/strategy-evaluation-kernel';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import { ChanBspFactorPlugin } from '../factor/plugins/chan-bsp.plugin';
import { SimulatedBroker } from './simulated-broker';
import { ExecutionRiskArbiter } from './execution-risk-arbiter';
import type { KernelSignal } from '../kernel/kernel.types';
import { applySlippage } from './slippage-fee-calculator';
import { ORDER_SIDES } from '../strategy.constants';

/**
 * chan 回测 T+1 一致性回归守卫（任务 3 后置审计）：
 *
 * 缠论买点在确认 bar T 收盘由 chan-bsp 发出（signalTime = T），
 * SimulatedBroker 的因果律断言（bar.timestamp ≤ signalTime 不撮合）
 * 保证成交发生在 T+1 开盘——与 cys 账本的 T+1 开盘口径完全一致。
 * 同 bar 成交（偷看收盘价）被结构性禁止。
 */
it('chan T+1 一致性：确认 bar 收盘出信号，同 bar 不成交，次根开盘成交', async () => {
  // 合成市场：63 根日线（温和 V 形）
  const N = 63;
  // 1.2/bar 的单调段：H/L ±0.5 的振幅小于步长 → 相邻 bar 无包含关系，
  // 缠论 K 线合并不会吞掉任何 bar（否则 mock 的 klines.length 永远不达标）
  const closes = Array.from({ length: N }, (_, i) =>
    i < 30 ? 110 - i * 1.2 : 74 + (i - 30) * 1.2,
  );
  const bars: StrategyBar[] = closes.map((close, i) => ({
    securityId: 1,
    securityCode: '000001',
    source: 'qmt' as const,
    period: 1440,
    timestamp: new Date(Date.UTC(2026, 0, 4 + i, 16, 0, 0)),
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: '1000',
    amount: '100000',
    type: 'complete' as const,
  }));

  // chan-bsp：detectEvents mock 为在第 61 根（index 61）出现 second_buy
  const plugin = new ChanBspFactorPlugin();
  const registry = new InMemoryFactorPluginRegistry();
  registry.register(plugin);
  const EVENT_TIME = bars[61].timestamp;
  jest.spyOn(plugin as never, 'detectEvents').mockImplementation(((
    klines: readonly unknown[],
  ) => {
    if (klines.length < 62) return [];
    return [
      {
        type: 'second_buy' as const,
        units: 'bi' as const,
        time: EVENT_TIME,
        price: closes[61],
        zhongshuIndex: null,
        zg: null,
        zd: null,
        unitIndex: klines.length - 1,
      },
    ];
  }) as never);

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
          id: 'guard',
          type: 'GUARD',
          name: 'chan-entry',
          pluginId: 'plugin.chan.bsp',
          params: { units: 'bi', direction: 'buy' },
          requiredAction: 'BUY',
          minConfidence: 0.5,
          onPass: {
            id: 'term',
            type: 'TERMINAL',
            action: 'BUY',
            signalTag: 'CHAN_BSP',
            reason: 'chan buy point',
          },
        },
        ruleSnapshot: Object.freeze({}),
        period: 1440,
        requiredBarCount: 62,
        contextRequirements: {},
      },
    ],
  });

  const broker = new SimulatedBroker(1_000_000);
  broker.registerSecurity('000001', { name: '上证指数', preClose: 100 });
  const arbiter = new ExecutionRiskArbiter();
  const position = {
    securityId: 1,
    securityCode: '000001',
    status: 'EMPTY',
    holdingQuantity: 0,
    availableQuantity: 0,
    frozenQuantity: 0,
    quantity: 0,
    averageCost: 0,
    costPrice: 0,
    unrealizedPnlRatio: 0,
  } as never;

  const fills: { price: number; signalTime: Date; fillTime: Date }[] = [];
  const orderSignalTimes = new Map<string, Date>();
  let signalBarIndex = -1;

  for (let i = 0; i < N; i++) {
    const signals: readonly KernelSignal[] = await kernel.push(bars[i]);
    for (const signal of signals) {
      signalBarIndex = i;
      const orderDraft = arbiter.arbitrate({
        bar: bars[i],
        signal,
        position,
        availableCash: 1_000_000,
      });
      if (orderDraft) {
        const order = broker.submitOrder(orderDraft);
        if (order) orderSignalTimes.set(order.orderId, order.signalTime);
      }
    }
    for (const fill of broker.onBar(bars[i])) {
      fills.push({
        price: fill.fillPrice,
        signalTime: orderSignalTimes.get(fill.orderId) ?? bars[i].timestamp,
        fillTime: bars[i].timestamp,
      });
    }
  }

  // 信号在 index 61 收盘发出（确认 bar）
  expect(signalBarIndex).toBe(61);
  // 同 bar（index 61）不成交——因果律断言生效
  expect(
    fills.filter((f) => f.fillTime.getTime() === bars[61].timestamp.getTime()),
  ).toHaveLength(0);
  // 次根开盘成交（index 62），成交价 = 开盘 × (1 + 滑点)
  expect(fills).toHaveLength(1);
  expect(fills[0].fillTime.getTime()).toBe(bars[62].timestamp.getTime());
  expect(fills[0].signalTime.getTime()).toBe(bars[61].timestamp.getTime());
  expect(fills[0].price).toBeCloseTo(
    applySlippage(bars[62].open, ORDER_SIDES.BUY),
    2,
  );
}, 30000);
