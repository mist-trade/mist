import {
  BacktestOrderSide,
  BacktestOrderStatus,
  BacktestTradeStatus,
  StrategySignalKind,
} from '@app/shared-data';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';
import {
  StrategyEvaluationContextBuilder,
  StrategyNormalizedEvaluationBar,
} from '../scanner/strategy-evaluation-context.builder';
import {
  StrategyBacktestBar,
  StrategyBacktestConfig,
  StrategyBacktestEquityPoint,
  StrategyBacktestInput,
  StrategyBacktestMetrics,
  StrategyBacktestOrder,
  StrategyBacktestOutput,
  StrategyBacktestSignal,
  StrategyBacktestTrade,
} from './strategy-backtest.types';
import { cloneJsonRecord } from './strategy-backtest.utils';

type PositionState = {
  securityCode: string;
  quantity: number;
  entryTime: Date;
  entryPriceFen: number;
  entryGrossFen: number;
  entryFeeFen: number;
  tradeIndex: number;
};

type EngineState = {
  cashFen: number;
  positions: Map<string, PositionState>;
  lastCloseFenBySecurity: Map<string, number>;
  signals: StrategyBacktestSignal[];
  orders: StrategyBacktestOrder[];
  trades: StrategyBacktestTrade[];
  tradesByIndex: Map<number, StrategyBacktestTrade>;
  pendingOrdersByTimestamp: Map<number, StrategyBacktestOrder[]>;
  equityPoints: StrategyBacktestEquityPoint[];
  peakEquityFen: number;
};

type SecurityEvaluationState = {
  completedBars: StrategyNormalizedEvaluationBar[];
  previousContext?: Record<string, unknown>;
};

type BenchmarkState = {
  currentCloseFen: number | null;
  baseCloseFen: number | null;
  nextIndex: number;
};

type ExecutionFees = {
  commissionFen: number;
  stampDutyFen: number;
  transferFeeFen: number;
  totalFeeFen: number;
};

type PreparedBacktest = {
  input: StrategyBacktestInput;
  state: EngineState;
  barsBySecurity: Map<string, StrategyBacktestBar[]>;
  evaluationBarsByKey: Map<string, StrategyNormalizedEvaluationBar>;
  evaluationStateBySecurity: Map<string, SecurityEvaluationState>;
  nextBarByKey: Map<string, StrategyBacktestBar>;
  eventBarsByTimestamp: Map<number, StrategyBacktestBar[]>;
  eventTimestamps: number[];
  dateIndexes: Map<number, number>;
  benchmarkBars: StrategyBacktestBar[];
  benchmarkState: BenchmarkState;
};

export type StrategyBacktestBatchProgress = {
  processedWork: number;
  totalWork: number;
};

export const STRATEGY_BACKTEST_DEFAULT_CONFIG: Readonly<StrategyBacktestConfig> =
  Object.freeze({
    initialCash: 1_000_000,
    maxPositions: 10,
    slippageBps: 5,
    commissionRate: 0.0003,
    minCommission: 5,
    stampDutyRate: 0.0005,
    transferFeeRate: 0.00001,
    benchmarkCode: '000300',
  });

export function cnyToFen(value: number): number {
  return roundHalfUp(value * 100);
}

export function fenToCny(value: number): number {
  return value / 100;
}

export function normalizeStrategyBacktestConfig(
  overrides: Partial<StrategyBacktestConfig> = {},
): StrategyBacktestConfig {
  const definedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined),
  ) as Partial<StrategyBacktestConfig>;

  return {
    ...STRATEGY_BACKTEST_DEFAULT_CONFIG,
    ...definedOverrides,
  };
}

export function normalizeStrategyBacktestBars(
  bars: StrategyBacktestBar[],
): StrategyBacktestBar[] {
  return [...bars].sort((left, right) => {
    const timestampDiff = left.timestamp.getTime() - right.timestamp.getTime();
    if (timestampDiff !== 0) return timestampDiff;
    return left.securityCode.localeCompare(right.securityCode);
  });
}

export class StrategyBacktestEngine {
  constructor(
    private readonly contextBuilder = new StrategyEvaluationContextBuilder(),
    private readonly ruleEvaluator = new StrategyRuleEvaluator(),
  ) {}

  run(input: StrategyBacktestInput): StrategyBacktestOutput {
    const prepared = this.prepareRun(input);
    for (const timestamp of prepared.eventTimestamps) {
      this.processTimestamp(prepared, timestamp);
    }
    return this.toOutput(prepared);
  }

  async runInBatches(
    input: StrategyBacktestInput,
    batchSize: number,
    onBatch?: (progress: StrategyBacktestBatchProgress) => Promise<void> | void,
  ): Promise<StrategyBacktestOutput> {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('Backtest batchSize must be a positive integer');
    }

    const prepared = this.prepareRun(input);
    for (let index = 0; index < prepared.eventTimestamps.length; index += 1) {
      this.processTimestamp(prepared, prepared.eventTimestamps[index]);
      if (
        onBatch &&
        ((index + 1) % batchSize === 0 ||
          index + 1 === prepared.eventTimestamps.length)
      ) {
        await onBatch({
          processedWork: index + 1,
          totalWork: prepared.eventTimestamps.length,
        });
      }
    }
    return this.toOutput(prepared);
  }

  private prepareRun(input: StrategyBacktestInput): PreparedBacktest {
    this.assertInput(input);
    const normalizedBars = normalizeStrategyBacktestBars(input.bars).filter(
      (bar) => bar.timestamp <= input.endDate,
    );
    const barsBySecurity = this.groupBarsBySecurity(normalizedBars);
    const evaluationBarsByKey = this.indexEvaluationBars(normalizedBars);
    const evaluationStateBySecurity = this.createEvaluationStates(
      barsBySecurity,
      evaluationBarsByKey,
      input.startDate,
      input.lookbackBars,
    );
    const nextBarByKey = this.indexNextBars(barsBySecurity, input.endDate);
    const eventBarsByTimestamp = this.groupInRangeBarsByTimestamp(
      normalizedBars,
      input.startDate,
      input.endDate,
    );
    const eventTimestamps = [...eventBarsByTimestamp.keys()].sort(
      (left, right) => left - right,
    );
    const state: EngineState = {
      cashFen: cnyToFen(input.config.initialCash),
      positions: new Map<string, PositionState>(),
      lastCloseFenBySecurity: this.collectPreStartCloses(
        normalizedBars,
        input.startDate,
      ),
      signals: [],
      orders: [],
      trades: [],
      tradesByIndex: new Map<number, StrategyBacktestTrade>(),
      pendingOrdersByTimestamp: new Map<number, StrategyBacktestOrder[]>(),
      equityPoints: [],
      peakEquityFen: cnyToFen(input.config.initialCash),
    };
    const dateIndexes = new Map<number, number>(
      eventTimestamps.map((timestamp, index) => [timestamp, index]),
    );
    const benchmarkBars = normalizeStrategyBacktestBars(
      input.benchmarkBars,
    ).filter(
      (bar) =>
        bar.timestamp >= input.startDate && bar.timestamp <= input.endDate,
    );
    const benchmarkState: BenchmarkState = {
      currentCloseFen: null,
      baseCloseFen: null,
      nextIndex: 0,
    };

    return {
      input,
      state,
      barsBySecurity,
      evaluationBarsByKey,
      evaluationStateBySecurity,
      nextBarByKey,
      eventBarsByTimestamp,
      eventTimestamps,
      dateIndexes,
      benchmarkBars,
      benchmarkState,
    };
  }

  private processTimestamp(
    prepared: PreparedBacktest,
    timestamp: number,
  ): void {
    const currentBars = prepared.eventBarsByTimestamp.get(timestamp) ?? [];
    const currentBarsBySecurity = new Map(
      currentBars.map((bar) => [bar.securityCode, bar]),
    );
    const currentDate = new Date(timestamp);
    const dateIndex = prepared.dateIndexes.get(timestamp) ?? 0;

    this.executeScheduledOrders(
      prepared,
      currentDate,
      currentBarsBySecurity,
      dateIndex,
    );
    for (const bar of currentBars) {
      prepared.state.lastCloseFenBySecurity.set(
        bar.securityCode,
        cnyToFen(bar.close),
      );
    }

    const benchmarkValue = this.resolveBenchmarkValue(
      prepared.benchmarkBars,
      prepared.benchmarkState,
      currentDate,
      cnyToFen(prepared.input.config.initialCash),
    );
    prepared.state.equityPoints.push(
      this.createEquityPoint(prepared.state, currentDate, benchmarkValue),
    );

    this.evaluateDateRules(prepared, currentBars);
  }

  private toOutput(prepared: PreparedBacktest): StrategyBacktestOutput {
    return {
      signals: prepared.state.signals,
      orders: prepared.state.orders,
      trades: prepared.state.trades,
      equityPoints: prepared.state.equityPoints,
      metrics: this.calculateMetrics(
        prepared.state,
        prepared.input.config.initialCash,
      ),
    };
  }

  private assertInput(input: StrategyBacktestInput): void {
    if (input.startDate > input.endDate) {
      throw new Error('Backtest startDate must not be after endDate');
    }
    for (const bar of input.bars) {
      if (bar.securityType !== 'STOCK') {
        throw new Error(`Backtest only supports STOCK: ${bar.securityCode}`);
      }
    }
  }

  private groupBarsBySecurity(
    bars: StrategyBacktestBar[],
  ): Map<string, StrategyBacktestBar[]> {
    const groupedByTime = new Map<string, Map<number, StrategyBacktestBar>>();
    for (const bar of bars) {
      const securityBars = groupedByTime.get(bar.securityCode) ?? new Map();
      securityBars.set(bar.timestamp.getTime(), bar);
      groupedByTime.set(bar.securityCode, securityBars);
    }
    return new Map(
      [...groupedByTime.entries()].map(([securityCode, securityBars]) => [
        securityCode,
        [...securityBars.values()],
      ]),
    );
  }

  private groupInRangeBarsByTimestamp(
    bars: StrategyBacktestBar[],
    startDate: Date,
    endDate: Date,
  ): Map<number, StrategyBacktestBar[]> {
    const groupedBySecurity = new Map<
      number,
      Map<string, StrategyBacktestBar>
    >();
    for (const bar of bars) {
      if (bar.timestamp < startDate || bar.timestamp > endDate) continue;
      const timestamp = bar.timestamp.getTime();
      const dateBars = groupedBySecurity.get(timestamp) ?? new Map();
      dateBars.set(bar.securityCode, bar);
      groupedBySecurity.set(timestamp, dateBars);
    }
    return new Map(
      [...groupedBySecurity.entries()].map(([timestamp, dateBars]) => [
        timestamp,
        [...dateBars.values()].sort((left, right) =>
          left.securityCode.localeCompare(right.securityCode),
        ),
      ]),
    );
  }

  private indexEvaluationBars(
    bars: StrategyBacktestBar[],
  ): Map<string, StrategyNormalizedEvaluationBar> {
    return new Map(
      bars.map((bar) => [
        this.barKey(bar.securityCode, bar.timestamp),
        this.toEvaluationBar(bar),
      ]),
    );
  }

  private createEvaluationStates(
    barsBySecurity: Map<string, StrategyBacktestBar[]>,
    evaluationBarsByKey: Map<string, StrategyNormalizedEvaluationBar>,
    startDate: Date,
    lookbackBars: number,
  ): Map<string, SecurityEvaluationState> {
    const states = new Map<string, SecurityEvaluationState>();
    for (const [securityCode, securityBars] of barsBySecurity) {
      const completedBars = securityBars
        .filter((bar) => bar.timestamp < startDate)
        .slice(-(lookbackBars + 1))
        .flatMap((bar) => {
          const evaluationBar = evaluationBarsByKey.get(
            this.barKey(bar.securityCode, bar.timestamp),
          );
          return evaluationBar ? [evaluationBar] : [];
        });
      const previousBar = completedBars.at(-1);
      states.set(securityCode, {
        completedBars,
        previousContext: previousBar
          ? (this.contextBuilder.buildFromNormalizedK(
              previousBar,
              completedBars,
            ) as unknown as Record<string, unknown>)
          : undefined,
      });
    }
    return states;
  }

  private indexNextBars(
    barsBySecurity: Map<string, StrategyBacktestBar[]>,
    endDate: Date,
  ): Map<string, StrategyBacktestBar> {
    const nextBars = new Map<string, StrategyBacktestBar>();
    for (const securityBars of barsBySecurity.values()) {
      for (let index = 0; index + 1 < securityBars.length; index += 1) {
        const nextBar = securityBars[index + 1];
        if (nextBar.timestamp > endDate) continue;
        nextBars.set(
          this.barKey(
            securityBars[index].securityCode,
            securityBars[index].timestamp,
          ),
          nextBar,
        );
      }
    }
    return nextBars;
  }

  private collectPreStartCloses(
    bars: StrategyBacktestBar[],
    startDate: Date,
  ): Map<string, number> {
    const closes = new Map<string, number>();
    for (const bar of bars) {
      if (bar.timestamp >= startDate) break;
      closes.set(bar.securityCode, cnyToFen(bar.close));
    }
    return closes;
  }

  private executeScheduledOrders(
    prepared: PreparedBacktest,
    currentDate: Date,
    currentBarsBySecurity: Map<string, StrategyBacktestBar>,
    dateIndex: number,
  ): void {
    const state = prepared.state;
    const scheduledOrders = (
      state.pendingOrdersByTimestamp.get(currentDate.getTime()) ?? []
    )
      .filter((order) => order.status === BacktestOrderStatus.PENDING)
      .sort((left, right) => {
        const sideDiff =
          this.orderSideRank(left.side) - this.orderSideRank(right.side);
        if (sideDiff !== 0) return sideDiff;
        const codeDiff = left.securityCode.localeCompare(right.securityCode);
        if (codeDiff !== 0) return codeDiff;
        return left.orderIndex - right.orderIndex;
      });
    state.pendingOrdersByTimestamp.delete(currentDate.getTime());

    for (const order of scheduledOrders) {
      const bar = currentBarsBySecurity.get(order.securityCode);
      if (!bar) {
        this.expireOrder(order, 'missing_scheduled_bar', currentDate);
        continue;
      }
      if (order.side === BacktestOrderSide.SELL) {
        this.executeSellOrder(
          state,
          order,
          bar,
          prepared.nextBarByKey,
          prepared.input,
          prepared.dateIndexes,
          dateIndex,
        );
        if (order.status === BacktestOrderStatus.PENDING) {
          this.enqueuePendingOrder(state, order);
        }
      } else {
        this.executeBuyOrder(state, order, bar, prepared.input.config);
      }
    }
  }

  private evaluateDateRules(
    prepared: PreparedBacktest,
    currentBars: StrategyBacktestBar[],
  ): void {
    const { input, state } = prepared;
    const rules = [
      {
        signalKind: StrategySignalKind.EXIT,
        rule: input.exitRule,
      },
      {
        signalKind: StrategySignalKind.ENTRY,
        rule: input.entryRule,
      },
    ].filter(
      (
        candidate,
      ): candidate is {
        signalKind: StrategySignalKind;
        rule: Record<string, unknown>;
      } => candidate.rule !== null,
    );

    // Build, once per current bar, the {current, previous} evaluation contexts
    // (filtering strictly to bars at or before this timestamp to avoid
    // lookahead). Both entry and exit rules then reuse these pre-built
    // contexts, eliminating the prior 2× per-(rule × bar) filter + map +
    // full-indicator recompute.
    const contextsBySecurity = new Map<
      string,
      { current: Record<string, unknown>; previous?: Record<string, unknown> }
    >();
    for (const bar of currentBars) {
      const evaluationBar = prepared.evaluationBarsByKey.get(
        this.barKey(bar.securityCode, bar.timestamp),
      );
      const evaluationState = prepared.evaluationStateBySecurity.get(
        bar.securityCode,
      );
      if (!evaluationBar || !evaluationState) continue;
      evaluationState.completedBars.push(evaluationBar);
      if (evaluationState.completedBars.length > input.lookbackBars + 1) {
        evaluationState.completedBars.shift();
      }
      const context = this.contextBuilder.buildFromNormalizedK(
        evaluationBar,
        evaluationState.completedBars,
      ) as unknown as Record<string, unknown>;
      contextsBySecurity.set(bar.securityCode, {
        current: context,
        previous: evaluationState.previousContext,
      });
      evaluationState.previousContext = context;
    }

    for (const { signalKind, rule } of rules) {
      for (const bar of currentBars) {
        const entry = contextsBySecurity.get(bar.securityCode);
        if (!entry) continue;
        const evaluation = this.ruleEvaluator.evaluate(
          rule,
          entry.current,
          entry.previous,
        );
        if (!evaluation.matched) continue;

        const signal: StrategyBacktestSignal = {
          signalIndex: state.signals.length + 1,
          securityCode: bar.securityCode,
          signalKind,
          signalTime: new Date(bar.timestamp),
          contextSnapshot: cloneJsonRecord(entry.current),
          ruleSnapshot: cloneJsonRecord(rule),
        };
        state.signals.push(signal);
        this.scheduleOrderForSignal(prepared, signal, bar);
      }
    }
  }

  private scheduleOrderForSignal(
    prepared: PreparedBacktest,
    signal: StrategyBacktestSignal,
    bar: StrategyBacktestBar,
  ): void {
    const state = prepared.state;
    const side =
      signal.signalKind === StrategySignalKind.ENTRY
        ? BacktestOrderSide.BUY
        : BacktestOrderSide.SELL;
    if (
      side === BacktestOrderSide.SELL &&
      !state.positions.has(bar.securityCode)
    ) {
      state.orders.push(
        this.createOrder(
          state.orders.length + 1,
          signal.signalIndex,
          bar.securityCode,
          side,
          BacktestOrderStatus.REJECTED,
          'no_open_position',
          bar.timestamp,
        ),
      );
      return;
    }

    const nextBar = prepared.nextBarByKey.get(
      this.barKey(bar.securityCode, bar.timestamp),
    );
    if (!nextBar) {
      state.orders.push(
        this.createOrder(
          state.orders.length + 1,
          signal.signalIndex,
          bar.securityCode,
          side,
          BacktestOrderStatus.EXPIRED,
          'no_next_available_bar',
          bar.timestamp,
        ),
      );
      return;
    }

    const order = this.createOrder(
      state.orders.length + 1,
      signal.signalIndex,
      bar.securityCode,
      side,
      BacktestOrderStatus.PENDING,
      null,
      nextBar.timestamp,
    );
    state.orders.push(order);
    this.enqueuePendingOrder(state, order);
  }

  private createOrder(
    orderIndex: number,
    signalIndex: number,
    securityCode: string,
    side: BacktestOrderSide,
    status: BacktestOrderStatus,
    reason: string | null,
    scheduledTime: Date,
  ): StrategyBacktestOrder {
    return {
      orderIndex,
      signalIndex,
      securityCode,
      side,
      status,
      reason,
      scheduledTime: new Date(scheduledTime),
      executionTime: null,
      expiredAt:
        status === BacktestOrderStatus.EXPIRED ? new Date(scheduledTime) : null,
      quantity: 0,
      fillPrice: null,
      grossAmount: null,
      commission: 0,
      stampDuty: 0,
      transferFee: 0,
      totalFee: 0,
    };
  }

  private executeBuyOrder(
    state: EngineState,
    order: StrategyBacktestOrder,
    bar: StrategyBacktestBar,
    config: StrategyBacktestConfig,
  ): void {
    if (state.positions.has(order.securityCode)) {
      this.rejectOrder(order, 'already_holding');
      return;
    }
    if (state.positions.size >= config.maxPositions) {
      this.rejectOrder(order, 'max_positions_reached');
      return;
    }

    const fillPriceFen = this.calculateFillPriceFen(
      bar.open,
      BacktestOrderSide.BUY,
      config.slippageBps,
    );
    if (fillPriceFen <= 0) {
      this.rejectOrder(order, 'invalid_fill_price');
      return;
    }

    const equityFen = this.calculateEquityFen(state);
    const targetNotionalFen = Math.floor(equityFen / config.maxPositions);
    let quantity = Math.floor(targetNotionalFen / fillPriceFen / 100) * 100;
    let grossAmountFen = 0;
    let fees: ExecutionFees = {
      commissionFen: 0,
      stampDutyFen: 0,
      transferFeeFen: 0,
      totalFeeFen: 0,
    };

    while (quantity >= 100) {
      grossAmountFen = fillPriceFen * quantity;
      fees = this.calculateFees(grossAmountFen, BacktestOrderSide.BUY, config);
      if (grossAmountFen + fees.totalFeeFen <= state.cashFen) break;
      quantity -= 100;
    }
    if (quantity < 100) {
      this.rejectOrder(order, 'insufficient_cash');
      return;
    }

    state.cashFen -= grossAmountFen + fees.totalFeeFen;
    this.fillOrder(
      order,
      bar.timestamp,
      quantity,
      fillPriceFen,
      grossAmountFen,
      fees,
    );
    const trade: StrategyBacktestTrade = {
      tradeIndex: state.trades.length + 1,
      securityCode: order.securityCode,
      status: BacktestTradeStatus.OPEN,
      entryOrderIndex: order.orderIndex,
      exitOrderIndex: null,
      entryTime: new Date(bar.timestamp),
      exitTime: null,
      entryPrice: fenToCny(fillPriceFen),
      exitPrice: null,
      quantity,
      entryFee: fenToCny(fees.totalFeeFen),
      exitFee: 0,
      realizedPnl: null,
      holdingDays: null,
    };
    state.trades.push(trade);
    state.tradesByIndex.set(trade.tradeIndex, trade);
    state.positions.set(order.securityCode, {
      securityCode: order.securityCode,
      quantity,
      entryTime: new Date(bar.timestamp),
      entryPriceFen: fillPriceFen,
      entryGrossFen: grossAmountFen,
      entryFeeFen: fees.totalFeeFen,
      tradeIndex: trade.tradeIndex,
    });
  }

  private executeSellOrder(
    state: EngineState,
    order: StrategyBacktestOrder,
    bar: StrategyBacktestBar,
    nextBarByKey: Map<string, StrategyBacktestBar>,
    input: StrategyBacktestInput,
    dateIndexes: Map<number, number>,
    dateIndex: number,
  ): void {
    const position = state.positions.get(order.securityCode);
    if (!position) {
      this.rejectOrder(order, 'no_open_position');
      return;
    }
    if (this.isSameTradingDate(position.entryTime, bar.timestamp)) {
      const nextBar = nextBarByKey.get(
        this.barKey(bar.securityCode, bar.timestamp),
      );
      if (!nextBar) {
        this.expireOrder(order, 't_plus_one_end_of_range', bar.timestamp);
      } else {
        order.scheduledTime = new Date(nextBar.timestamp);
      }
      return;
    }

    const fillPriceFen = this.calculateFillPriceFen(
      bar.open,
      BacktestOrderSide.SELL,
      input.config.slippageBps,
    );
    if (fillPriceFen <= 0) {
      this.rejectOrder(order, 'invalid_fill_price');
      return;
    }

    const grossAmountFen = fillPriceFen * position.quantity;
    const fees = this.calculateFees(
      grossAmountFen,
      BacktestOrderSide.SELL,
      input.config,
    );
    state.cashFen += grossAmountFen - fees.totalFeeFen;
    this.fillOrder(
      order,
      bar.timestamp,
      position.quantity,
      fillPriceFen,
      grossAmountFen,
      fees,
    );
    const trade = state.tradesByIndex.get(position.tradeIndex);
    if (!trade) {
      throw new Error(`Missing trade for open position ${order.securityCode}`);
    }

    trade.status = BacktestTradeStatus.CLOSED;
    trade.exitOrderIndex = order.orderIndex;
    trade.exitTime = new Date(bar.timestamp);
    trade.exitPrice = fenToCny(fillPriceFen);
    trade.exitFee = fenToCny(fees.totalFeeFen);
    trade.realizedPnl = fenToCny(
      grossAmountFen -
        fees.totalFeeFen -
        position.entryGrossFen -
        position.entryFeeFen,
    );
    trade.holdingDays = Math.max(
      0,
      dateIndex - (dateIndexes.get(position.entryTime.getTime()) ?? dateIndex),
    );
    state.positions.delete(order.securityCode);
  }

  private calculateFillPriceFen(
    open: number,
    side: BacktestOrderSide,
    slippageBps: number,
  ): number {
    const directionalSlippage =
      side === BacktestOrderSide.BUY ? slippageBps : -slippageBps;
    return cnyToFen(open * (1 + directionalSlippage / 10_000));
  }

  private calculateFees(
    grossAmountFen: number,
    side: BacktestOrderSide,
    config: StrategyBacktestConfig,
  ): ExecutionFees {
    const commissionFen = Math.max(
      roundHalfUp(grossAmountFen * config.commissionRate),
      cnyToFen(config.minCommission),
    );
    const transferFeeFen = roundHalfUp(grossAmountFen * config.transferFeeRate);
    const stampDutyFen =
      side === BacktestOrderSide.SELL
        ? roundHalfUp(grossAmountFen * config.stampDutyRate)
        : 0;

    return {
      commissionFen,
      stampDutyFen,
      transferFeeFen,
      totalFeeFen: commissionFen + stampDutyFen + transferFeeFen,
    };
  }

  private fillOrder(
    order: StrategyBacktestOrder,
    executionTime: Date,
    quantity: number,
    fillPriceFen: number,
    grossAmountFen: number,
    fees: ExecutionFees,
  ): void {
    order.status = BacktestOrderStatus.FILLED;
    order.reason = null;
    order.executionTime = new Date(executionTime);
    order.quantity = quantity;
    order.fillPrice = fenToCny(fillPriceFen);
    order.grossAmount = fenToCny(grossAmountFen);
    order.commission = fenToCny(fees.commissionFen);
    order.stampDuty = fenToCny(fees.stampDutyFen);
    order.transferFee = fenToCny(fees.transferFeeFen);
    order.totalFee = fenToCny(fees.totalFeeFen);
  }

  private rejectOrder(order: StrategyBacktestOrder, reason: string): void {
    order.status = BacktestOrderStatus.REJECTED;
    order.reason = reason;
  }

  private expireOrder(
    order: StrategyBacktestOrder,
    reason: string,
    expiredAt: Date = order.scheduledTime,
  ): void {
    order.status = BacktestOrderStatus.EXPIRED;
    order.reason = reason;
    order.expiredAt = new Date(expiredAt);
  }

  private orderSideRank(side: BacktestOrderSide): number {
    return side === BacktestOrderSide.SELL ? 0 : 1;
  }

  private calculateEquityFen(state: EngineState): number {
    let marketValueFen = 0;
    for (const position of state.positions.values()) {
      const closeFen = state.lastCloseFenBySecurity.get(position.securityCode);
      if (closeFen !== undefined) {
        marketValueFen += closeFen * position.quantity;
      }
    }
    return state.cashFen + marketValueFen;
  }

  private createEquityPoint(
    state: EngineState,
    pointTime: Date,
    benchmarkValue: number | null,
  ): StrategyBacktestEquityPoint {
    let marketValueFen = 0;
    for (const position of state.positions.values()) {
      const closeFen = state.lastCloseFenBySecurity.get(position.securityCode);
      if (closeFen !== undefined) {
        marketValueFen += closeFen * position.quantity;
      }
    }
    const equityFen = state.cashFen + marketValueFen;
    state.peakEquityFen = Math.max(state.peakEquityFen, equityFen);
    const drawdown =
      state.peakEquityFen === 0
        ? 0
        : (equityFen - state.peakEquityFen) / state.peakEquityFen;
    const exposure = equityFen === 0 ? 0 : marketValueFen / equityFen;

    return {
      pointTime: new Date(pointTime),
      cash: fenToCny(state.cashFen),
      marketValue: fenToCny(marketValueFen),
      equity: fenToCny(equityFen),
      benchmarkValue,
      drawdown,
      exposure,
    };
  }

  private resolveBenchmarkValue(
    benchmarkBars: StrategyBacktestBar[],
    state: BenchmarkState,
    currentDate: Date,
    initialCashFen: number,
  ): number | null {
    while (
      state.nextIndex < benchmarkBars.length &&
      benchmarkBars[state.nextIndex].timestamp <= currentDate
    ) {
      state.currentCloseFen = cnyToFen(benchmarkBars[state.nextIndex].close);
      state.nextIndex += 1;
    }
    if (state.currentCloseFen === null) return null;
    if (state.baseCloseFen === null) {
      state.baseCloseFen = state.currentCloseFen;
    }
    if (state.baseCloseFen === 0) return null;

    return fenToCny(
      roundHalfUp(
        (initialCashFen * state.currentCloseFen) / state.baseCloseFen,
      ),
    );
  }

  private calculateMetrics(
    state: EngineState,
    initialCash: number,
  ): StrategyBacktestMetrics {
    const points = state.equityPoints;
    if (points.length === 0) {
      return {
        totalReturn: null,
        annualizedReturn: null,
        annualizedVolatility: null,
        sharpeRatio: null,
        maxDrawdown: null,
        maxDrawdownDuration: null,
        calmarRatio: null,
        benchmarkReturn: null,
        excessReturn: null,
        winRate: null,
        profitFactor: null,
        tradeCount: 0,
        averageHoldingDays: null,
        turnover: null,
        averageExposure: null,
      };
    }

    const finalPoint = points[points.length - 1];
    const totalReturn = this.finiteOrNull(finalPoint.equity / initialCash - 1);
    const annualizedReturn =
      totalReturn !== null && finalPoint.equity > 0
        ? this.finiteOrNull(
            points.length > 1
              ? (1 + totalReturn) ** (252 / (points.length - 1)) - 1
              : totalReturn,
          )
        : null;
    const dailyReturns = points.slice(1).flatMap((point, index) => {
      const previousEquity = points[index].equity;
      if (previousEquity <= 0) return [];
      const dailyReturn = this.finiteOrNull(point.equity / previousEquity - 1);
      return dailyReturn === null ? [] : [dailyReturn];
    });
    const annualizedVolatility =
      dailyReturns.length === points.length - 1
        ? this.calculateAnnualizedVolatility(dailyReturns)
        : null;
    const sharpeRatio =
      annualizedReturn === null ||
      annualizedVolatility === null ||
      annualizedVolatility === 0
        ? null
        : this.finiteOrNull(annualizedReturn / annualizedVolatility);
    const maxDrawdown = this.finiteOrNull(
      Math.min(...points.map((point) => point.drawdown)),
    );
    const maxDrawdownDuration = this.calculateMaxDrawdownDuration(points);
    const calmarRatio =
      annualizedReturn === null || maxDrawdown === null || maxDrawdown === 0
        ? null
        : this.finiteOrNull(annualizedReturn / Math.abs(maxDrawdown));
    const benchmarkReturn =
      points[0].benchmarkValue === null || finalPoint.benchmarkValue === null
        ? null
        : this.finiteOrNull(finalPoint.benchmarkValue / initialCash - 1);
    const closedTrades = state.trades.filter(
      (trade) => trade.status === BacktestTradeStatus.CLOSED,
    );
    const positivePnl = closedTrades.reduce(
      (sum, trade) => sum + Math.max(0, trade.realizedPnl ?? 0),
      0,
    );
    const negativePnl = closedTrades.reduce(
      (sum, trade) => sum + Math.min(0, trade.realizedPnl ?? 0),
      0,
    );
    const averageEquity =
      points.reduce((sum, point) => sum + point.equity, 0) / points.length;
    const filledNotional = state.orders
      .filter((order) => order.status === BacktestOrderStatus.FILLED)
      .reduce((sum, order) => sum + (order.grossAmount ?? 0), 0);

    return {
      totalReturn,
      annualizedReturn,
      annualizedVolatility,
      sharpeRatio,
      maxDrawdown,
      maxDrawdownDuration,
      calmarRatio,
      benchmarkReturn,
      excessReturn:
        benchmarkReturn === null || totalReturn === null
          ? null
          : this.finiteOrNull(totalReturn - benchmarkReturn),
      winRate:
        closedTrades.length === 0
          ? null
          : closedTrades.filter((trade) => (trade.realizedPnl ?? 0) > 0)
              .length / closedTrades.length,
      profitFactor:
        negativePnl === 0
          ? null
          : this.finiteOrNull(positivePnl / Math.abs(negativePnl)),
      tradeCount: closedTrades.length,
      averageHoldingDays:
        closedTrades.length === 0
          ? null
          : this.finiteOrNull(
              closedTrades.reduce(
                (sum, trade) => sum + (trade.holdingDays ?? 0),
                0,
              ) / closedTrades.length,
            ),
      turnover:
        averageEquity <= 0
          ? null
          : this.finiteOrNull(filledNotional / averageEquity),
      averageExposure: this.finiteOrNull(
        points.reduce((sum, point) => sum + point.exposure, 0) / points.length,
      ),
    };
  }

  private calculateAnnualizedVolatility(returns: number[]): number | null {
    if (returns.length === 0) return null;
    const average =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      returns.length;
    if (variance === 0) return null;
    return this.finiteOrNull(Math.sqrt(variance) * Math.sqrt(252));
  }

  private calculateMaxDrawdownDuration(
    points: StrategyBacktestEquityPoint[],
  ): number {
    let peakIndex = 0;
    let drawdownStartIndex: number | null = null;
    let maxDuration = 0;

    for (let index = 0; index < points.length; index += 1) {
      if (index === 0 || points[index].equity >= points[peakIndex].equity) {
        if (drawdownStartIndex !== null) {
          maxDuration = Math.max(maxDuration, index - drawdownStartIndex);
          drawdownStartIndex = null;
        }
        peakIndex = index;
        continue;
      }
      if (drawdownStartIndex === null) {
        drawdownStartIndex = peakIndex;
      }
      maxDuration = Math.max(maxDuration, index - drawdownStartIndex);
    }

    return maxDuration;
  }

  private toEvaluationBar(
    bar: StrategyBacktestBar,
  ): StrategyNormalizedEvaluationBar {
    return {
      security: {
        code: bar.securityCode,
        type: bar.securityType,
      },
      source: bar.source,
      period: bar.period,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
    };
  }

  private enqueuePendingOrder(
    state: EngineState,
    order: StrategyBacktestOrder,
  ): void {
    const timestamp = order.scheduledTime.getTime();
    const pendingOrders = state.pendingOrdersByTimestamp.get(timestamp) ?? [];
    pendingOrders.push(order);
    state.pendingOrdersByTimestamp.set(timestamp, pendingOrders);
  }

  private barKey(securityCode: string, timestamp: Date): string {
    return `${securityCode}\u0000${timestamp.getTime()}`;
  }

  private finiteOrNull(value: number): number | null {
    return Number.isFinite(value) ? value : null;
  }

  private isSameTradingDate(left: Date, right: Date): boolean {
    const beijingDayKey = (value: Date) =>
      Math.floor((value.getTime() + 8 * 60 * 60 * 1_000) / 86_400_000);
    return beijingDayKey(left) === beijingDayKey(right);
  }
}

function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Backtest money values must be finite');
  }

  const magnitude = Math.abs(value);
  const rounded = Math.floor(
    magnitude + 0.5 + Number.EPSILON * Math.max(1, magnitude),
  );
  return value < 0 ? -rounded : rounded;
}
