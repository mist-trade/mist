import {
  cnyToFen,
  fenToCny,
  normalizeStrategyBacktestConfig,
  normalizeStrategyBacktestBars,
  STRATEGY_BACKTEST_DEFAULT_CONFIG,
  StrategyBacktestEngine,
} from './strategy-backtest.engine';
import {
  StrategyBacktestBar,
  StrategyBacktestInput,
} from './strategy-backtest.types';
import {
  BacktestOrderSide,
  BacktestOrderStatus,
  DataSource,
  Period,
  StrategySignalKind,
} from '@app/shared-data';

describe('StrategyBacktestEngine primitives', () => {
  const createBar = (
    securityCode: string,
    day: number,
    close: number = 10,
    overrides: Partial<StrategyBacktestBar> = {},
  ): StrategyBacktestBar => ({
    securityCode,
    securityType: 'STOCK',
    source: DataSource.TDX,
    period: Period.DAY,
    timestamp: new Date(Date.UTC(2026, 0, day)),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
    amount: close * 1_000,
    ...overrides,
  });

  const createInput = (
    overrides: Partial<StrategyBacktestInput> = {},
  ): StrategyBacktestInput => ({
    strategyDefinitionId: 1,
    strategyVersionId: 1,
    entryRule: { field: 'k.close', operator: 'gt', value: 100 },
    exitRule: { field: 'k.close', operator: 'lt', value: 90 },
    lookbackBars: 1,
    startDate: new Date(Date.UTC(2026, 0, 1)),
    endDate: new Date(Date.UTC(2026, 0, 4)),
    bars: [],
    benchmarkBars: [],
    config: {
      ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
      initialCash: 100_000,
      maxPositions: 1,
      slippageBps: 0,
      commissionRate: 0,
      minCommission: 0,
      stampDutyRate: 0,
      transferFeeRate: 0,
    },
    ...overrides,
  });

  it('uses fixed-point fen with half-up CNY rounding', () => {
    expect(cnyToFen(12.345)).toBe(1235);
    expect(cnyToFen(12.344)).toBe(1234);
    expect(fenToCny(1235)).toBe(12.35);
  });

  it('normalizes daily bars by timestamp and canonical security code', () => {
    const normalized = normalizeStrategyBacktestBars([
      createBar('600519', 3),
      createBar('000001', 3),
      createBar('600519', 2),
    ]);

    expect(
      normalized.map((bar) => [bar.timestamp.toISOString(), bar.securityCode]),
    ).toEqual([
      ['2026-01-02T00:00:00.000Z', '600519'],
      ['2026-01-03T00:00:00.000Z', '000001'],
      ['2026-01-03T00:00:00.000Z', '600519'],
    ]);
  });

  it('publishes the approved portfolio defaults in one immutable location', () => {
    expect(STRATEGY_BACKTEST_DEFAULT_CONFIG).toEqual({
      initialCash: 1_000_000,
      maxPositions: 10,
      slippageBps: 5,
      commissionRate: 0.0003,
      minCommission: 5,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
      benchmarkCode: '000300',
    });
  });

  it('signals at the close and fills at the next available open without same-bar execution', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        bars: [
          createBar('600519', 1, 110, { open: 100 }),
          createBar('600519', 2, 120, { open: 120 }),
          createBar('600519', 3, 80, { open: 90 }),
          createBar('600519', 4, 70, { open: 70 }),
        ],
      }),
    );

    const entrySignal = output.signals.find(
      (signal) =>
        signal.signalKind === StrategySignalKind.ENTRY &&
        signal.signalTime.toISOString() === '2026-01-01T00:00:00.000Z',
    );
    const entryOrder = output.orders.find(
      (order) => order.signalIndex === entrySignal?.signalIndex,
    );
    const exitSignal = output.signals.find(
      (signal) =>
        signal.signalKind === StrategySignalKind.EXIT &&
        signal.signalTime.toISOString() === '2026-01-03T00:00:00.000Z',
    );
    const exitOrder = output.orders.find(
      (order) => order.signalIndex === exitSignal?.signalIndex,
    );

    expect(entryOrder).toMatchObject({
      side: BacktestOrderSide.BUY,
      status: BacktestOrderStatus.FILLED,
      executionTime: new Date(Date.UTC(2026, 0, 2)),
      fillPrice: 120,
    });
    expect(exitOrder).toMatchObject({
      side: BacktestOrderSide.SELL,
      status: BacktestOrderStatus.FILLED,
      executionTime: new Date(Date.UTC(2026, 0, 4)),
      fillPrice: 70,
    });
  });

  it('executes simultaneous exits before entries in stable security order', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        entryRule: { field: 'k.close', operator: 'gt', value: 100 },
        exitRule: { field: 'k.close', operator: 'gt', value: 100 },
        endDate: new Date(Date.UTC(2026, 0, 3)),
        bars: [
          createBar('600519', 1, 110, { open: 100 }),
          createBar('600519', 2, 110, { open: 110 }),
          createBar('600519', 3, 110, { open: 110 }),
        ],
      }),
    );

    const thirdDayFills = output.orders.filter(
      (order) =>
        order.status === BacktestOrderStatus.FILLED &&
        order.executionTime?.toISOString() === '2026-01-03T00:00:00.000Z',
    );

    expect(thirdDayFills.map((order) => order.side)).toEqual([
      BacktestOrderSide.SELL,
      BacktestOrderSide.BUY,
    ]);
  });

  it('waits for a security next available open across internal market-date gaps', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        endDate: new Date(Date.UTC(2026, 0, 3)),
        bars: [
          createBar('600519', 1, 110),
          createBar('000001', 2, 80),
          createBar('600519', 3, 120, { open: 120 }),
        ],
      }),
    );

    const order = output.orders.find(
      (candidate) =>
        candidate.securityCode === '600519' &&
        candidate.side === BacktestOrderSide.BUY,
    );

    expect(order).toMatchObject({
      status: BacktestOrderStatus.FILLED,
      scheduledTime: new Date(Date.UTC(2026, 0, 3)),
      executionTime: new Date(Date.UTC(2026, 0, 3)),
    });
  });

  it('expires an order when no later in-range bar exists', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        endDate: new Date(Date.UTC(2026, 0, 2)),
        bars: [createBar('600519', 1, 110), createBar('000001', 2, 80)],
      }),
    );

    expect(output.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          securityCode: '600519',
          side: BacktestOrderSide.BUY,
          status: BacktestOrderStatus.EXPIRED,
          reason: 'no_next_available_bar',
          expiredAt: new Date(Date.UTC(2026, 0, 1)),
        }),
      ]),
    );
  });

  it('produces identical facts when equivalent input rows arrive shuffled', () => {
    const input = createInput({
      bars: [
        createBar('000001', 1, 110),
        createBar('600519', 1, 110),
        createBar('000001', 2, 120),
        createBar('600519', 2, 120),
        createBar('000001', 3, 80),
        createBar('600519', 3, 80),
      ],
    });
    const engine = new StrategyBacktestEngine();

    expect(engine.run({ ...input, bars: [...input.bars].reverse() })).toEqual(
      engine.run(input),
    );
  });

  it('produces the same facts through bounded asynchronous date batches', async () => {
    const input = createInput({
      bars: [
        createBar('600519', 1, 110),
        createBar('600519', 2, 120),
        createBar('600519', 3, 80),
      ],
    });
    const engine = new StrategyBacktestEngine();
    const progress: Array<[number, number]> = [];

    const output = await engine.runInBatches(input, 1, (batch) => {
      progress.push([batch.processedWork, batch.totalWork]);
    });

    expect(output).toEqual(engine.run(input));
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('normalizes the selected benchmark from the first comparable in-range bar', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        startDate: new Date(Date.UTC(2026, 0, 2)),
        endDate: new Date(Date.UTC(2026, 0, 3)),
        bars: [createBar('600519', 2, 110), createBar('600519', 3, 120)],
        benchmarkBars: [
          createBar('000300', 1, 50),
          createBar('000300', 2, 100),
          createBar('000300', 3, 110),
        ],
      }),
    );

    expect(output.equityPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pointTime: new Date(Date.UTC(2026, 0, 2)),
          benchmarkValue: 100_000,
        }),
        expect.objectContaining({
          pointTime: new Date(Date.UTC(2026, 0, 3)),
          benchmarkValue: 110_000,
        }),
      ]),
    );
  });

  it('allocates equal-weight slots using whole 100-share lots', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        config: {
          ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
          initialCash: 100_000,
          maxPositions: 2,
          slippageBps: 0,
          commissionRate: 0,
          minCommission: 0,
          stampDutyRate: 0,
          transferFeeRate: 0,
        },
        bars: [
          createBar('000001', 1, 110),
          createBar('600519', 1, 110),
          createBar('000001', 2, 110),
          createBar('600519', 2, 110),
        ],
      }),
    );

    expect(
      output.orders
        .filter((order) => order.status === BacktestOrderStatus.FILLED)
        .map((order) => [order.securityCode, order.quantity]),
    ).toEqual([
      ['000001', 400],
      ['600519', 400],
    ]);
  });

  it('reduces an entry to the affordable whole lot and rejects when even one lot cannot clear fees', () => {
    const affordableOutput = new StrategyBacktestEngine().run(
      createInput({
        config: {
          ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
          initialCash: 15_000,
          maxPositions: 1,
          slippageBps: 0,
          commissionRate: 0,
          minCommission: 0,
          stampDutyRate: 0,
          transferFeeRate: 0,
        },
        bars: [
          createBar('600519', 1, 110),
          createBar('600519', 2, 101, { open: 101 }),
        ],
      }),
    );
    const insufficientCashOutput = new StrategyBacktestEngine().run(
      createInput({
        config: {
          ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
          initialCash: 10_000,
          maxPositions: 1,
          slippageBps: 0,
          commissionRate: 0.001,
          minCommission: 0,
          stampDutyRate: 0,
          transferFeeRate: 0,
        },
        bars: [
          createBar('600519', 1, 110),
          createBar('600519', 2, 100, { open: 100 }),
        ],
      }),
    );

    expect(affordableOutput.orders[0]).toMatchObject({
      status: BacktestOrderStatus.FILLED,
      quantity: 100,
    });
    expect(insufficientCashOutput.orders[0]).toMatchObject({
      status: BacktestOrderStatus.REJECTED,
      reason: 'insufficient_cash',
      quantity: 0,
    });
  });

  it('enforces maximum positions, rejects pyramiding, and closes whole positions', () => {
    const maxPositionOutput = new StrategyBacktestEngine().run(
      createInput({
        bars: [
          createBar('000001', 1, 110),
          createBar('600519', 1, 110),
          createBar('000001', 2, 110),
          createBar('600519', 2, 110),
        ],
      }),
    );
    const pyramidAndExitOutput = new StrategyBacktestEngine().run(
      createInput({
        bars: [
          createBar('600519', 1, 110),
          createBar('600519', 2, 120),
          createBar('600519', 3, 80),
          createBar('600519', 4, 70),
        ],
      }),
    );

    expect(maxPositionOutput.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          securityCode: '600519',
          status: BacktestOrderStatus.REJECTED,
          reason: 'max_positions_reached',
        }),
      ]),
    );
    expect(pyramidAndExitOutput.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          side: BacktestOrderSide.BUY,
          status: BacktestOrderStatus.REJECTED,
          reason: 'already_holding',
        }),
      ]),
    );
    expect(pyramidAndExitOutput.trades).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'closed',
          quantity: 800,
          exitOrderIndex: expect.any(Number),
        }),
      ]),
    );
  });

  it('keeps a same-day exit pending until the next available trading date', () => {
    const engine = new StrategyBacktestEngine();
    const secondDay = new Date(Date.UTC(2026, 0, 2));
    const thirdDay = new Date(Date.UTC(2026, 0, 3));
    const order: any = {
      orderIndex: 1,
      signalIndex: 1,
      securityCode: '600519',
      side: BacktestOrderSide.SELL,
      status: BacktestOrderStatus.PENDING,
      reason: null,
      scheduledTime: secondDay,
      executionTime: null,
      quantity: 0,
      fillPrice: null,
      grossAmount: null,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
    };
    const state: any = {
      cashFen: cnyToFen(10_000),
      positions: new Map([
        [
          '600519',
          {
            securityCode: '600519',
            quantity: 100,
            entryTime: secondDay,
            entryPriceFen: cnyToFen(100),
            entryGrossFen: cnyToFen(10_000),
            entryFeeFen: 0,
            tradeIndex: 1,
          },
        ],
      ]),
      trades: [
        {
          tradeIndex: 1,
          securityCode: '600519',
          status: 'open',
          entryOrderIndex: 0,
          exitOrderIndex: null,
          entryTime: secondDay,
          exitTime: null,
          entryPrice: 100,
          exitPrice: null,
          quantity: 100,
          entryFee: 0,
          exitFee: 0,
          realizedPnl: null,
          holdingDays: null,
        },
      ],
    };

    (engine as any).executeSellOrder(
      state,
      order,
      createBar('600519', 2, 100),
      [createBar('600519', 2, 100), createBar('600519', 3, 100)],
      createInput({ endDate: thirdDay }),
      new Map([
        [secondDay.getTime(), 0],
        [thirdDay.getTime(), 1],
      ]),
      0,
    );

    expect(order).toMatchObject({
      status: BacktestOrderStatus.PENDING,
      scheduledTime: thirdDay,
      executionTime: null,
    });
  });

  it('applies default directional slippage and every fee with half-up fen rounding', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        config: {
          ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
        },
        bars: [
          createBar('600519', 1, 110, { open: 100 }),
          createBar('600519', 2, 100, { open: 100 }),
          createBar('600519', 3, 80, { open: 90 }),
          createBar('600519', 4, 100, { open: 100 }),
        ],
      }),
    );
    const [buy, sell] = output.orders.filter(
      (order) => order.status === BacktestOrderStatus.FILLED,
    );

    expect(buy).toMatchObject({
      side: BacktestOrderSide.BUY,
      fillPrice: 100.05,
      quantity: 900,
      grossAmount: 90_045,
      commission: 27.01,
      transferFee: 0.9,
      stampDuty: 0,
      totalFee: 27.91,
    });
    expect(sell).toMatchObject({
      side: BacktestOrderSide.SELL,
      fillPrice: 99.95,
      quantity: 900,
      grossAmount: 89_955,
      commission: 26.99,
      transferFee: 0.9,
      stampDuty: 44.98,
      totalFee: 72.87,
    });
  });

  it('uses editable overrides and rounds each fractional fee independently', () => {
    const roundedOutput = new StrategyBacktestEngine().run(
      createInput({
        config: {
          ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
          initialCash: 101,
          maxPositions: 1,
          slippageBps: 0,
          commissionRate: 0.00005,
          minCommission: 0,
          stampDutyRate: 0.00005,
          transferFeeRate: 0.00005,
        },
        bars: [
          createBar('600519', 1, 110),
          createBar('600519', 2, 1, { open: 1 }),
          createBar('600519', 3, 0.5, { open: 1 }),
          createBar('600519', 4, 1, { open: 1 }),
        ],
      }),
    );
    const overrideOutput = new StrategyBacktestEngine().run(
      createInput({
        config: {
          ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
          initialCash: 100_000,
          maxPositions: 1,
          slippageBps: 100,
          commissionRate: 0.01,
          minCommission: 0,
          stampDutyRate: 0,
          transferFeeRate: 0.02,
        },
        bars: [
          createBar('600519', 1, 110),
          createBar('600519', 2, 100, { open: 100 }),
        ],
      }),
    );

    expect(roundedOutput.orders[0]).toMatchObject({
      commission: 0.01,
      transferFee: 0.01,
      totalFee: 0.02,
    });
    expect(roundedOutput.orders[1]).toMatchObject({
      commission: 0.01,
      transferFee: 0.01,
      stampDuty: 0.01,
      totalFee: 0.03,
    });
    expect(overrideOutput.orders[0]).toMatchObject({
      fillPrice: 101,
      commission: 909,
      transferFee: 1818,
      totalFee: 2727,
    });
    expect(
      normalizeStrategyBacktestConfig({
        maxPositions: 3,
        benchmarkCode: '399001',
      }),
    ).toEqual({
      ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
      maxPositions: 3,
      benchmarkCode: '399001',
    });
  });

  it('emits daily equity, normalized benchmark, drawdown, and audited performance metrics', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        bars: [
          createBar('600519', 1, 110, { open: 100 }),
          createBar('600519', 2, 100, { open: 100 }),
          createBar('600519', 3, 80, { open: 90 }),
          createBar('600519', 4, 110, { open: 110 }),
        ],
        benchmarkBars: [
          createBar('000300', 1, 100),
          createBar('000300', 2, 105),
          createBar('000300', 3, 110),
          createBar('000300', 4, 120),
        ],
      }),
    );

    expect(output.equityPoints).toHaveLength(4);
    expect(output.equityPoints[0]).toMatchObject({
      equity: 100_000,
      benchmarkValue: 100_000,
      drawdown: 0,
      exposure: 0,
    });
    expect(output.equityPoints.at(-1)).toMatchObject({
      equity: 110_000,
      benchmarkValue: 120_000,
      drawdown: 0,
      exposure: 0,
    });
    expect(output.metrics).toMatchObject({
      maxDrawdown: -0.2,
      maxDrawdownDuration: 2,
      winRate: 1,
      tradeCount: 1,
      averageHoldingDays: 2,
      turnover: 210_000 / 97_500,
      averageExposure: 0.5,
    });
    expect(output.metrics.totalReturn).toBeCloseTo(0.1, 12);
    expect(output.metrics.benchmarkReturn).toBeCloseTo(0.2, 12);
    expect(output.metrics.excessReturn).toBeCloseTo(-0.1, 12);
    expect(output.metrics.annualizedVolatility).toEqual(expect.any(Number));
    expect(output.metrics.sharpeRatio).toEqual(expect.any(Number));
    expect(output.metrics.calmarRatio).toEqual(expect.any(Number));
  });

  it('returns null instead of non-finite ratios when there is no denominator', () => {
    const output = new StrategyBacktestEngine().run(
      createInput({
        bars: [createBar('600519', 1, 80)],
        benchmarkBars: [],
      }),
    );

    expect(output.metrics).toMatchObject({
      annualizedVolatility: null,
      sharpeRatio: null,
      calmarRatio: null,
      benchmarkReturn: null,
      excessReturn: null,
      winRate: null,
      profitFactor: null,
      averageHoldingDays: null,
      turnover: 0,
    });
    expect(
      Object.values(output.metrics).every(
        (value) =>
          value === null || typeof value !== 'number' || Number.isFinite(value),
      ),
    ).toBe(true);
  });
});
