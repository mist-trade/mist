import {
  BacktestRunStatus,
  DataSource,
  Period,
  StrategyRuleSchemaVersion,
} from '@app/shared-data';
import {
  availabilityKey,
  compileStoredDefinitionVersion,
  LegacyStrategyCompiler,
  MarketRiskRegime,
  recomputeNextBarOpenBuyQuantity,
  applySlippageLi,
  EXECUTION_RULES,
  ORDER_SIDES,
  shanghaiMidnight,
  SimulatedBroker,
  TradingEngine,
  TRADING_LAYER_DEFAULTS,
  yuanToLi,
  type DailyNavSnapshot,
} from '@app/strategy';
import { formatShanghaiDateString } from '@app/timezone';
import type { StrategyBar } from '@app/market-data';
import { computeUnderwaterDuration } from '@app/indicators';
import { createChanFullOutputFixture } from '../../../libs/chancore/src/chan-full-output.characterization.fixture';
import { HealthStateService } from './health/health-state.service';
import {
  alignEquityReturns,
  BacktestRunExecutor,
  collectSortedDates,
} from './backtest-run.executor';

function run() {
  return {
    id: 41,
    strategyVersionId: 7,
    targetUniverse: ['600000.SH', 'MISSING.SH'],
    targetIssues: [],
    period: Period.DAY,
    source: DataSource.TDX,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-31T00:00:00.000Z'),
    status: BacktestRunStatus.PENDING,
    kind: 'rule_dsl',
  };
}

function executor(overrides: Record<string, unknown> = {}) {
  const current = run();
  const manager = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  const dependencies = {
    runRepository: {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(current),
    },
    resultRepository: {
      insert: jest.fn(),
      create: jest.fn((input: object) => ({ id: 1, ...input })),
    },
    tradeRepository: {
      insert: jest.fn(),
      create: jest.fn((input: object) => ({ id: 1, ...input })),
    },
    versionRepository: {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
        rule: { field: 'k.close', operator: 'gt', value: 1 },
        signalKind: 'entry',
      }),
    },
    securityRepository: {
      find: jest.fn().mockResolvedValue([]),
    },
    definitionRepository: {
      findOne: jest.fn().mockResolvedValue({ id: 3, periods: [1440] }),
    },
    marketData: {
      readReplayPage: jest.fn(),
      loadReplayWindow: jest.fn(),
    },
    dataSource,
    config: {
      get: jest.fn((key: string) =>
        key === 'BACKTEST_RUN_TIMEOUT_MS'
          ? 60_000
          : key === 'BACKTEST_MAX_BARS_PER_RUN'
            ? 10_000
            : undefined,
      ),
    },
    health: new HealthStateService(),
    suiteExecutor: {
      isMasterSuiteRun: jest.fn().mockReturnValue(false),
      executeSuite: jest.fn().mockResolvedValue(undefined),
    },
  };
  return {
    instance: (() => {
      const inst = new BacktestRunExecutor(
        dependencies.runRepository as any,
        dependencies.resultRepository as any,
        dependencies.tradeRepository as any,
        dependencies.versionRepository as any,
        dependencies.securityRepository as any,
        dependencies.definitionRepository as any,
        dependencies.marketData as any,
        dependencies.dataSource as any,
        dependencies.config as any,
        dependencies.health,
        dependencies.suiteExecutor as any,
      );
      if ((overrides as any).chanBspDetector !== undefined) {
        (inst as any).chanBspDetector = (overrides as any).chanBspDetector;
      }
      return inst;
    })(),
    current,
    manager,
    dependencies,
    ...overrides,
  };
}

describe('BacktestRunExecutor', () => {
  it('persists all target issues in the same failure cleanup transaction', async () => {
    const fixture = executor();

    await fixture.instance.execute(fixture.current.id);

    expect(
      fixture.dependencies.marketData.readReplayPage,
    ).not.toHaveBeenCalled();
    expect(fixture.dependencies.runRepository.update).toHaveBeenCalledTimes(1);
    expect(fixture.dependencies.dataSource.transaction).toHaveBeenCalledTimes(
      1,
    );
    expect(fixture.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 41, status: expect.anything() }),
      expect.objectContaining({
        status: BacktestRunStatus.FAILED,
        errorMessage: 'BACKTEST_NO_EXECUTABLE_TARGETS',
        targetIssues: [
          { securityCode: '600000.SH', code: 'SECURITY_NOT_FOUND' },
          { securityCode: 'MISSING.SH', code: 'SECURITY_NOT_FOUND' },
        ],
      }),
    );
    expect(fixture.manager.delete).toHaveBeenCalledWith(expect.anything(), {
      backtestRunId: 41,
    });
  });

  it('uses the same cleanup boundary when the claim readback fails', async () => {
    const fixture = executor();
    fixture.dependencies.runRepository.findOne.mockResolvedValueOnce(null);

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.dataSource.transaction).toHaveBeenCalledTimes(
      1,
    );
    expect(fixture.manager.delete).toHaveBeenCalledWith(expect.anything(), {
      backtestRunId: 41,
    });
  });

  it('hydrates the initial window segment bidirectionally before streaming bars', async () => {
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    fixture.current.period = Period.ONE_MIN;
    fixture.current.startDate = startDate;
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: { field: 'k.close', operator: 'gt', value: 1 },
      signalKind: 'entry',
    });
    // 12 bars before the replay start; the leading one has a broken OHLC
    // four-tuple and must be back-filled from its later same-day anchor.
    const hydrated = Array.from({ length: 12 }, (_, index) =>
      strategyBar(
        `2026-08-04T01:${String(30 + index).padStart(2, '0')}:00.000Z`,
      ),
    );
    hydrated[0] = { ...hydrated[0], open: Number.NaN };
    const streaming = strategyBar('2026-08-04T01:42:00.000Z');
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: hydrated,
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [streaming],
      nextAfterTimestamp: null,
    });
    fixture.dependencies.resultRepository.create.mockImplementation(
      (input: object) => ({ id: 1, ...input }),
    );

    await fixture.instance.execute(fixture.current.id);

    // Two-phase contract: initial segment loaded with an exclusive endAt at the
    // replay start (minute plans anchor at the Shanghai day open), then the
    // streaming page starts at the replay start; the public phase boundary is
    // still run.startDate (kernel timeline split).
    expect(
      fixture.dependencies.marketData.loadReplayWindow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: 9,
        selection: { kind: 'provider', source: 'tdx' },
        period: Period.ONE_MIN,
        endAt: startDate,
      }),
    );
    expect(fixture.dependencies.marketData.readReplayPage).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: startDate }),
    );
    // 矫正层消化破损 OHLC 后，确认 Bar 时刻落盘（双时间戳 trigger 语义）
    expect(fixture.dependencies.resultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        signalTime: streaming.timestamp,
        pivotTime: null,
      }),
    );
    expect(fixture.dependencies.runRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41, status: BacktestRunStatus.RUNNING }),
      expect.objectContaining({
        status: BacktestRunStatus.COMPLETED,
        signalCount: 1,
      }),
    );
  });

  it('allows a quantity-consuming plan to proceed to replay after HIL approval', async () => {
    // quantity profile HIL 已通过，量价 plan 现在可以正常 replay。
    const fixture = executor();
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: { field: 'k.volume', operator: 'gt', value: '0' },
      signalKind: 'entry',
    });
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [],
      nextAfterTimestamp: null,
    });

    await fixture.instance.execute(fixture.current.id);

    // 验证 plan 进入了 replay 阶段（gate 已移除）
    expect(fixture.dependencies.marketData.loadReplayWindow).toHaveBeenCalled();
  });

  it('bounds the hydration window at the replay start so a quantity plan never overlaps the streaming page', async () => {
    // F1 回归：消费量价的分钟级 plan，replayStartFor 回到当日开盘（08-04T01:30Z = 上海
    // 09:30）；盘中 startDate（01:42Z）时 initial 窗口必须以 replayStart 为界，否则与
    // page 重叠（append 抛 strictly increasing RangeError）。
    // 注：量价 plan 现在可以正常 replay（quantity profile HIL 已通过）。
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    const run = {
      ...fixture.current,
      period: Period.ONE_MIN,
      startDate,
      targetUniverse: ['600000.SH'],
    };
    const rule = { field: 'k.volume', operator: 'gt', value: '0' };
    const compiled = compileStoredDefinitionVersion({
      kind: 'rule_dsl',
      rule,
      signalKind: 'entry',
    });
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [strategyBar('2026-08-04T01:42:00.000Z')],
      nextAfterTimestamp: null,
    });
    const budget = {
      consumed: 0,
      consume: jest.fn(),
      checkpoint: jest.fn(),
      checkDeadline: jest.fn(),
    };

    await (fixture.instance as any).replaySecurity(
      run,
      compiled,
      rule,
      '600000.SH',
      9,
      [],
      new Set<string>(),
      budget,
      () => {},
    );

    expect(
      fixture.dependencies.marketData.loadReplayWindow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: 9,
        selection: { kind: 'provider', source: 'tdx' },
        period: Period.ONE_MIN,
        endAt: run.startDate,
      }),
    );
    expect(fixture.dependencies.marketData.readReplayPage).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: run.startDate }),
    );
  });

  it('keeps evaluations insufficient until the hydrated window plus appends fill the plan', async () => {
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    fixture.current.period = Period.ONE_MIN;
    fixture.current.startDate = startDate;
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: { field: 'indicator.kdj.k', operator: 'gt', value: -1 },
      signalKind: 'entry',
    });
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [strategyBar('2026-08-04T01:42:00.000Z')],
      nextAfterTimestamp: null,
    });
    fixture.dependencies.resultRepository.create.mockImplementation(
      (input: object) => ({ id: 1, ...input }),
    );

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.resultRepository.create).not.toHaveBeenCalled();
    expect(fixture.dependencies.runRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 41, status: BacktestRunStatus.RUNNING }),
      expect.objectContaining({
        status: BacktestRunStatus.COMPLETED,
        signalCount: 0,
      }),
    );
  });

  it('counts hydrated bars against the replay budget', async () => {
    const startDate = new Date('2026-08-04T01:42:00.000Z');
    const fixture = executor();
    fixture.current.period = Period.ONE_MIN;
    fixture.current.startDate = startDate;
    fixture.current.targetUniverse = ['600000.SH'];
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: { field: 'k.close', operator: 'gt', value: 1 },
      signalKind: 'entry',
    });
    (fixture.dependencies.config.get as jest.Mock).mockImplementation(
      (key: string) =>
        key === 'BACKTEST_RUN_TIMEOUT_MS'
          ? 60_000
          : key === 'BACKTEST_MAX_BARS_PER_RUN'
            ? 1
            : undefined,
    );
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [
        strategyBar('2026-08-04T01:30:00.000Z'),
        strategyBar('2026-08-04T01:31:00.000Z'),
      ],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [strategyBar('2026-08-04T01:42:00.000Z')],
      nextAfterTimestamp: null,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 41, status: expect.anything() }),
      expect.objectContaining({
        status: BacktestRunStatus.FAILED,
        errorMessage: 'BACKTEST_BAR_LIMIT_EXCEEDED',
      }),
    );
  });
});

function strategyBar(timestamp: string, period = 1): StrategyBar {
  const close = 10.5;
  return {
    securityId: 9,
    source: 'tdx',
    period,
    timestamp: new Date(timestamp),
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: '100',
    amount: '200',
    type: 'complete',
  };
}

function completedUpdateCall(fixture: {
  dependencies: { runRepository: { update: { mock: { calls: unknown[][] } } } };
}): Record<string, unknown> {
  const calls = fixture.dependencies.runRepository.update.mock.calls;
  const completed = calls.find(
    (call) =>
      ((call[1] as Record<string, unknown>).status as string) ===
      BacktestRunStatus.COMPLETED,
  );
  return (completed?.[1] as Record<string, unknown>) ?? {};
}

describe('BacktestRunExecutor 统一内核回放', () => {
  function chanRunFixture() {
    const fixture = executor();
    const chanRun = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period: 30,
      startDate: new Date('2022-01-01T00:00:00.000Z'),
      endDate: new Date('2025-01-31T00:00:00.000Z'),
      kind: 'chan_bsp',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(chanRun);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: {
        units: 'duan',
        direction: 'both',
        points: { first: true, second: true, third: true },
      },
      signalKind: 'entry',
    });
    fixture.dependencies.definitionRepository.findOne.mockResolvedValue({
      id: 3,
      periods: [30],
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH', type: 'STOCK', status: 1 } as any,
    ]);
    return fixture;
  }

  function chanBspBars(): StrategyBar[] {
    return createChanFullOutputFixture().map((k, index) => ({
      securityId: 9,
      source: 'tdx',
      period: 30,
      timestamp: new Date(k.time),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: index % 7 === 0 ? '0' : '1000', // 含 0 异常量价，矫正层应消化
      amount: String(Number(k.amount)), // fixture 尾零小数非 canonical，规范化为整数/去尾零
      type: 'complete',
    }));
  }

  it('is honest with the real chan plugin when the structure confirms no point', async () => {
    // 真实 ChanBspFactorPlugin（统一内核标准注册表）：45 根日线不足段级结构
    // → 空结果，run 仍 COMPLETED、0 信号（结构不足是常态空结果，非错误）。
    const fixture = chanRunFixture();
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: chanBspBars(),
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.resultRepository.create).not.toHaveBeenCalled();
    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.signalCount).toBe(0);
    expect(completedUpdate.matchedSecurityCount).toBe(0);
  });

  it('replays chan_bsp with zero and null quantities', async () => {
    const fixture = chanRunFixture();
    const bars = chanBspBars().map((bar, index) =>
      index % 5 === 0 ? { ...bar, volume: null, amount: null } : bar,
    );
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars,
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.status).toBe(BacktestRunStatus.COMPLETED);
  });

  it('replays a decision_flow plan and saves decisionTrace without confidence', async () => {
    const fixture = executor();
    const flowRun = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period: 30,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      kind: 'decision_flow',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(flowRun);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: {
        id: 'term_test',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'TEST_FLOW',
        reason: '测试决策流触发',
        requiredBarCount: 5,
      },
      signalKind: 'entry',
    });
    fixture.dependencies.definitionRepository.findOne.mockResolvedValue({
      id: 3,
      periods: [30],
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH' },
    ]);
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    // 7 根 Bar：统一内核窗口满额（requiredBarCount=5，index 4 起）后恒定发射
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: [1, 2, 3, 4, 5, 6, 7].map((n) =>
        strategyBar(
          `2026-01-${String(n + 4).padStart(2, '0')}T01:30:00.000Z`,
          30,
        ),
      ),
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.resultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        backtestRunId: 41,
        securityCode: '600000.SH',
        decisionTrace: expect.objectContaining({
          status: 'SIGNAL_EMITTED',
          signalTag: 'TEST_FLOW',
        }),
      }),
    );
    const createdPayload =
      fixture.dependencies.resultRepository.create.mock.calls[0][0];
    expect(createdPayload).not.toHaveProperty('confidence');
    expect(createdPayload).not.toHaveProperty('confidenceLevel');
    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.signalCount).toBe(3);
    expect(fixture.dependencies.resultRepository.insert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          backtestRunId: 41,
          securityCode: '600000.SH',
        }),
      ]),
    );
  });

  it('activates hard stop loss (-8%) and persists navSeries and trade results with HARD_STOP_LOSS exitReason', async () => {
    const fixture = executor();
    const run = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period: 1440,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      kind: 'decision_flow',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(run);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      // 信号层硬止损声明（2026-11-25 拍板：引擎不出方案，出场规则由策略定义
      // 经插件声明）：legacy 入场门禁 onFail 挂价格防守出场插件节点——该节点
      // 仅声明虚拟出场规则（求值恒 NEUTRAL 无信号），params 声明 -8% 止损。
      rule: {
        rootNode: {
          ...LegacyStrategyCompiler.compileRuleToDecisionFlow(
            { field: 'k.close', operator: 'gt', value: 5 },
            'entry',
          ),
          onFail: {
            id: 'guard_price_defense',
            type: 'GUARD',
            name: '价格防守出场规则声明',
            pluginId: 'plugin.exit.price-defense',
            params: { stopLossRatio: -0.08 },
            requiredAction: 'BOTH',
            onPass: {
              id: 'term_price_defense_abort',
              type: 'TERMINAL',
              action: 'ABORT',
              reason: '价格防守出场规则仅声明虚拟出场',
            },
          },
        },
        requiredBarCount: 1,
      },
      signalKind: 'entry',
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH', name: '浦发银行' },
    ]);
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });

    const bars: StrategyBar[] = [
      // Bar 1 (01-02): close 10.0 -> 触发 ENTRY 买入信号 (signalTime = 01-02 15:00)
      {
        securityId: 9,
        securityCode: '600000.SH',
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-02T15:00:00.000Z'),
        open: 10.0,
        high: 10.0,
        low: 10.0,
        close: 10.0,
        volume: '1000',
        amount: '10000',
        type: 'complete',
      },
      // Bar 2 (01-05): open 10.0 -> Next-Bar 撮合成交买入，建仓完成
      {
        securityId: 9,
        securityCode: '600000.SH',
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-05T15:00:00.000Z'),
        open: 10.0,
        high: 10.0,
        low: 10.0,
        close: 10.0,
        volume: '1000',
        amount: '10000',
        type: 'complete',
      },
      // Bar 3 (01-06): close 9.10 -> 跌破成本 10 × (1 - 0.08) = 9.2，信号层
      // 价格防守出场规则（PriceLevelExitPolicy）产出虚拟出场信号
      {
        securityId: 9,
        securityCode: '600000.SH',
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-06T15:00:00.000Z'),
        open: 9.2,
        high: 9.3,
        low: 9.0,
        close: 9.1,
        volume: '1000',
        amount: '9100',
        type: 'complete',
      },
      // Bar 4 (01-07): open 9.0 -> 组缓冲 Next-Bar decide 后撮合卖出，出场归因 VIRTUAL_EXIT
      {
        securityId: 9,
        securityCode: '600000.SH',
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-07T15:00:00.000Z'),
        open: 9.0,
        high: 9.1,
        low: 8.9,
        close: 9.0,
        volume: '1000',
        amount: '9000',
        type: 'complete',
      },
    ];

    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars,
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.status).toBe(BacktestRunStatus.COMPLETED);
    // 验证 navSeries 每日净值时序落盘
    expect(Array.isArray(completedUpdate.navSeries)).toBe(true);
    expect((completedUpdate.navSeries as any[]).length).toBeGreaterThanOrEqual(
      4,
    );
    expect((completedUpdate.navSeries as any[])[0]).toEqual(
      expect.objectContaining({
        date: expect.any(String),
        totalEquity: expect.any(Number),
      }),
    );

    // 验证交易流水记录：信号层出场归因（虚拟出场；exitKind/规则 id 细节在
    // 信号 contextSnapshot，trade 流水记录机器类型）
    expect(fixture.dependencies.tradeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        backtestRunId: 41,
        securityCode: '600000.SH',
        exitReason: 'VIRTUAL_EXIT',
      }),
    );
  });

  it('computes tradeCount, winRate, and profitLossRatio before flushTrades drains the trades buffer', async () => {
    const fixture = executor();
    const run = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period: Period.DAY,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      kind: 'decision_flow',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(run);

    const sellRuleFlow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'lt', value: 9.9 },
      'exit',
    );
    const buyRuleFlow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'gt', value: 10.1 },
      'entry',
    );
    const rootNode = {
      ...sellRuleFlow,
      onFail: buyRuleFlow,
    };

    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: {
        rootNode,
        requiredBarCount: 1,
      },
      signalKind: 'entry',
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH', name: '浦发银行' },
    ]);
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });

    const dailyBar = (
      iso: string,
      open: number,
      close: number,
    ): StrategyBar => ({
      securityId: 9,
      securityCode: '600000.SH',
      source: 'tdx',
      period: Period.DAY,
      timestamp: new Date(iso),
      open,
      high: Math.max(open, close) + 0.1,
      low: Math.min(open, close) - 0.1,
      close,
      volume: '100000',
      amount: String(Math.round(close * 100000)),
      type: 'complete',
    });

    // 2 笔完整闭环交易：第 1 笔盈利（10.2 买 -> 10.5 卖），第 2 笔亏损（10.2 买 -> 9.6 卖）
    const bars: StrategyBar[] = [
      dailyBar('2026-01-02T15:00:00.000Z', 10.0, 10.2), // BUY
      dailyBar('2026-01-05T15:00:00.000Z', 10.2, 10.4), // fill BUY #1
      dailyBar('2026-01-06T15:00:00.000Z', 10.4, 9.8), // SELL
      dailyBar('2026-01-07T15:00:00.000Z', 10.5, 10.0), // fill SELL #1 (win), close=10.0 neutral
      dailyBar('2026-01-08T15:00:00.000Z', 10.0, 10.2), // BUY
      dailyBar('2026-01-09T15:00:00.000Z', 10.2, 10.0), // fill BUY #2
      dailyBar('2026-01-12T15:00:00.000Z', 10.0, 9.7), // SELL
      dailyBar('2026-01-13T15:00:00.000Z', 9.6, 10.0), // fill SELL #2 (loss), close=10.0 neutral
    ];

    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars,
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.tradeRepository.insert).toHaveBeenCalledTimes(
      1,
    );
    const insertedTrades =
      fixture.dependencies.tradeRepository.insert.mock.calls[0][0];
    expect(insertedTrades).toHaveLength(2);

    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.status).toBe(BacktestRunStatus.COMPLETED);
    expect(completedUpdate.tradeCount).toBe(2);
    expect(completedUpdate.winRate).toBe(0.5);
    expect(completedUpdate.profitLossRatio).toBeGreaterThan(0);
  });

  it('delegates master suite runs to BacktestSuiteExecutor when scenarioId is WFA or STRESS_SUITE', async () => {
    const fixture = executor();
    fixture.dependencies.suiteExecutor.isMasterSuiteRun.mockReturnValue(true);

    await fixture.instance.execute(fixture.current.id);

    expect(
      fixture.dependencies.suiteExecutor.isMasterSuiteRun,
    ).toHaveBeenCalled();
    expect(
      fixture.dependencies.suiteExecutor.executeSuite,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: fixture.current.id }),
      expect.any(Function),
    );
  });
});

describe('BacktestRunExecutor 绩效口径（underwater duration + 组合夏普）', () => {
  function navSnapshot(
    securityCode: string,
    date: string,
    totalEquity: number,
    dailyReturn: number,
  ): DailyNavSnapshot {
    return {
      date,
      securityCode,
      closePrice: 10,
      holdingQuantity: 0,
      marketValue: 0,
      cash: totalEquity,
      totalEquity,
      dailyReturn,
    };
  }

  function stopLossBars(
    securityId: number,
    securityCode: string,
  ): StrategyBar[] {
    return [
      {
        securityId,
        securityCode,
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-02T15:00:00.000Z'),
        open: 10.0,
        high: 10.0,
        low: 10.0,
        close: 10.0, // 触发 ENTRY 信号
        volume: '1000',
        amount: '10000',
        type: 'complete',
      },
      {
        securityId,
        securityCode,
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-05T15:00:00.000Z'),
        open: 10.0,
        high: 10.0,
        low: 10.0,
        close: 10.0, // Next-Bar 撮合买入
        volume: '1000',
        amount: '10000',
        type: 'complete',
      },
      {
        securityId,
        securityCode,
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-06T15:00:00.000Z'),
        open: 9.2,
        high: 9.3,
        low: 9.0,
        close: 9.1, // -9% 触发硬止损裁决
        volume: '1000',
        amount: '9100',
        type: 'complete',
      },
      {
        securityId,
        securityCode,
        source: 'tdx',
        period: 1440,
        timestamp: new Date('2026-01-07T15:00:00.000Z'),
        open: 9.0,
        high: 9.1,
        low: 8.9,
        close: 9.0, // Next-Bar 撮合卖出
        volume: '1000',
        amount: '9000',
        type: 'complete',
      },
    ];
  }

  function stopLossFixture(
    targetUniverse: string[],
    securities: { id: number; code: string }[],
  ) {
    const fixture = executor();
    const run = {
      ...fixture.current,
      targetUniverse,
      period: 1440,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      kind: 'rule_dsl',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(run);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: { field: 'k.close', operator: 'gt', value: 5 },
      signalKind: 'entry',
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue(
      securities.map((s) => ({ ...s, name: s.code })),
    );
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    return fixture;
  }

  it('aligns per-security daily returns on the union date axis with zero fill', () => {
    const histories = [
      [
        navSnapshot('A', '2026-01-02', 100, 0),
        navSnapshot('A', '2026-01-06', 103, 0.03),
      ],
      [
        navSnapshot('B', '2026-01-03', 200, 0),
        navSnapshot('B', '2026-01-06', 198, -0.01),
      ],
    ];
    const sortedDates = collectSortedDates(histories);
    expect(sortedDates).toEqual(['2026-01-02', '2026-01-03', '2026-01-06']);

    const aligned = alignEquityReturns(histories, sortedDates);
    expect(aligned).toEqual([
      {
        securityCode: 'A',
        // 行0（建仓期）丢弃；01-03 缺失 fill-forward → 0；01-06 环比 3%
        returns: [0, 0.03],
      },
      {
        securityCode: 'B',
        // 首快照 01-03 无前值 → 0；01-06 环比 -1%
        returns: [0, -0.01],
      },
    ]);
  });

  it('skips empty nav histories when aligning', () => {
    const histories = [[], [navSnapshot('B', '2026-01-02', 200, 0)]];
    const sortedDates = collectSortedDates(histories);
    expect(alignEquityReturns(histories, sortedDates)).toEqual([
      { securityCode: 'B', returns: [] },
    ]);
  });

  it('multi-security run records underwater duration on the combined NAV basis', async () => {
    const fixture = stopLossFixture(
      ['600000.SH', '000001.SZ'],
      [
        { id: 9, code: '600000.SH' },
        { id: 10, code: '000001.SZ' },
      ],
    );
    fixture.dependencies.marketData.readReplayPage
      .mockResolvedValueOnce({
        bars: stopLossBars(9, '600000.SH'),
        nextAfterTimestamp: undefined,
      })
      .mockResolvedValueOnce({
        bars: stopLossBars(10, '000001.SZ'),
        nextAfterTimestamp: undefined,
      });

    await fixture.instance.execute(fixture.current.id);

    const completedUpdate = completedUpdateCall(fixture);
    expect(completedUpdate.status).toBe(BacktestRunStatus.COMPLETED);
    const navPoints = completedUpdate.navSeries as {
      date: string;
      totalEquity: number;
    }[];
    expect(navPoints.length).toBeGreaterThanOrEqual(4);
    // 回撤场景必然存在 underwater 时段，且与 max_drawdown 同源（合成 NAV）
    expect(completedUpdate.maxUnderwaterDuration).toBeGreaterThan(0);
    expect(completedUpdate.maxUnderwaterDuration).toBe(
      computeUnderwaterDuration(navPoints.map((p) => p.totalEquity)),
    );
    expect(Number.isFinite(completedUpdate.sharpeRatio as number)).toBe(true);
  });

  it('keeps portfolio Sharpe invariant when duplicating identical constituents', async () => {
    const two = stopLossFixture(
      ['600000.SH', '000001.SZ'],
      [
        { id: 9, code: '600000.SH' },
        { id: 10, code: '000001.SZ' },
      ],
    );
    two.dependencies.marketData.readReplayPage
      .mockResolvedValueOnce({
        bars: stopLossBars(9, '600000.SH'),
        nextAfterTimestamp: undefined,
      })
      .mockResolvedValueOnce({
        bars: stopLossBars(10, '000001.SZ'),
        nextAfterTimestamp: undefined,
      });
    await two.instance.execute(two.current.id);

    const three = stopLossFixture(
      ['600000.SH', '000001.SZ', '600036.SH'],
      [
        { id: 9, code: '600000.SH' },
        { id: 10, code: '000001.SZ' },
        { id: 11, code: '600036.SH' },
      ],
    );
    three.dependencies.marketData.readReplayPage
      .mockResolvedValueOnce({
        bars: stopLossBars(9, '600000.SH'),
        nextAfterTimestamp: undefined,
      })
      .mockResolvedValueOnce({
        bars: stopLossBars(10, '000001.SZ'),
        nextAfterTimestamp: undefined,
      })
      .mockResolvedValueOnce({
        bars: stopLossBars(11, '600036.SH'),
        nextAfterTimestamp: undefined,
      });
    await three.instance.execute(three.current.id);

    // 完全同构的标的互相复制：等权组合收益序列不变（(r+r)/2 = (r+r+r)/3 = r）
    // → 同一估计量、同一输入 → 综合夏普与回撤时长逐位相等
    expect(multiCompleted(three).sharpeRatio).toBe(
      multiCompleted(two).sharpeRatio,
    );
    expect(multiCompleted(three).maxUnderwaterDuration).toBe(
      multiCompleted(two).maxUnderwaterDuration,
    );
  });

  it('a non-trading constituent dilutes the portfolio Sharpe (zero-return cash days)', async () => {
    const flatBars = (
      securityId: number,
      securityCode: string,
    ): StrategyBar[] =>
      stopLossBars(securityId, securityCode).map((bar) => ({
        ...bar,
        close: 1.0, // 规则 close > 5 永不触发 → 该标的全程持现金
        open: 1.0,
        high: 1.0,
        low: 1.0,
      }));

    const single = stopLossFixture(
      ['600000.SH'],
      [{ id: 9, code: '600000.SH' }],
    );
    single.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: stopLossBars(9, '600000.SH'),
      nextAfterTimestamp: undefined,
    });
    await single.instance.execute(single.current.id);

    const multi = stopLossFixture(
      ['600000.SH', '000001.SZ'],
      [
        { id: 9, code: '600000.SH' },
        { id: 10, code: '000001.SZ' },
      ],
    );
    multi.dependencies.marketData.readReplayPage
      .mockResolvedValueOnce({
        bars: stopLossBars(9, '600000.SH'),
        nextAfterTimestamp: undefined,
      })
      .mockResolvedValueOnce({
        bars: flatBars(10, '000001.SZ'),
        nextAfterTimestamp: undefined,
      });
    await multi.instance.execute(multi.current.id);

    // 组合收益 = r_A/2（B 全零），rf 不随缩放减半 → 综合夏普严格偏离单标的口径
    expect(Number.isFinite(multiCompleted(multi).sharpeRatio as number)).toBe(
      true,
    );
    expect(multiCompleted(multi).sharpeRatio).not.toBe(
      completedUpdateCall(single).sharpeRatio,
    );
  });

  it('unified estimator: a single-security run keeps the exact single-series Sharpe value', async () => {
    // 统一后单标的也走组合算子（N=1 退化）：equity 环比 + 丢首行构造与
    // computeDailyReturns(navSeries) 同构 → 数值与原单序列夏普逐位一致（无回归）
    const single = stopLossFixture(
      ['600000.SH'],
      [{ id: 9, code: '600000.SH' }],
    );
    single.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: stopLossBars(9, '600000.SH'),
      nextAfterTimestamp: undefined,
    });
    await single.instance.execute(single.current.id);

    const multi = stopLossFixture(
      ['600000.SH', '000001.SZ'],
      [
        { id: 9, code: '600000.SH' },
        { id: 10, code: '000001.SZ' },
      ],
    );
    multi.dependencies.marketData.readReplayPage
      .mockResolvedValueOnce({
        bars: stopLossBars(9, '600000.SH'),
        nextAfterTimestamp: undefined,
      })
      .mockResolvedValueOnce({
        bars: stopLossBars(10, '000001.SZ'),
        nextAfterTimestamp: undefined,
      });
    await multi.instance.execute(multi.current.id);

    // 完全同构标的：等权组合收益 = 单标的收益 → 两条路径数值一致（量尺统一）
    expect(multiCompleted(multi).sharpeRatio).toBe(
      completedUpdateCall(single).sharpeRatio,
    );
    expect(multiCompleted(multi).maxUnderwaterDuration).toBe(
      completedUpdateCall(single).maxUnderwaterDuration,
    );
  });

  it('seeds the first-day price-limit basis from the previous daily close', async () => {
    const fixture = stopLossFixture(
      ['600000.SH'],
      [{ id: 9, code: '600000.SH' }],
    );
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    fixture.dependencies.marketData.readReplayPage.mockResolvedValue({
      bars: [],
      nextAfterTimestamp: null,
    });

    await fixture.instance.execute(fixture.current.id);

    // preClose 读取必须以上海零点为日线边界（与日线预热同构）：
    // 若用原始 startDate 作 endAt，startDate 当日的日线收盘会泄漏进首日基准（未来函数）
    expect(
      fixture.dependencies.marketData.loadReplayWindow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        securityId: 9,
        period: 1440,
        requiredBars: 1,
        endAt: shanghaiMidnight(new Date('2026-01-01T00:00:00.000Z')),
      }),
    );
  });
});

function multiCompleted(fixture: {
  dependencies: { runRepository: { update: { mock: { calls: unknown[][] } } } };
}): Record<string, unknown> {
  return completedUpdateCall(fixture);
}

describe('BacktestRunExecutor Wave 2B parity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function parityFixture(
    options: {
      period?: number;
      contextSnapshot?: Record<string, unknown> | null;
      rule?: Record<string, unknown>;
    } = {},
  ) {
    const fixture = executor();
    const period = options.period ?? Period.DAY;
    const run = {
      ...fixture.current,
      targetUniverse: ['600000.SH'],
      period,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      kind: 'decision_flow',
      ...(options.contextSnapshot !== undefined
        ? { contextSnapshot: options.contextSnapshot }
        : {}),
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(run);

    const sellRuleFlow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'lt', value: 9.9 },
      'exit',
    );
    const buyRuleFlow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'gt', value: 9.95 },
      'entry',
    );
    const rootNode = {
      ...sellRuleFlow,
      onFail: buyRuleFlow,
    };

    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      rule: options.rule ?? {
        rootNode,
        requiredBarCount: 1,
      },
      signalKind: 'entry',
    });
    fixture.dependencies.securityRepository.find.mockResolvedValue([
      { id: 9, code: '600000.SH', name: '浦发银行' },
    ]);
    fixture.dependencies.marketData.loadReplayWindow.mockResolvedValue({
      bars: [],
    });
    return fixture;
  }

  function makeBar(
    iso: string,
    period: number,
    open: number,
    close: number,
  ): StrategyBar {
    return {
      securityId: 9,
      securityCode: '600000.SH',
      source: 'tdx',
      period,
      timestamp: new Date(iso),
      open,
      high: Math.max(open, close) + 0.1,
      low: Math.min(open, close) - 0.1,
      close,
      volume: '100000',
      amount: String(Math.round(close * 100000)),
      type: 'complete',
    };
  }

  it('derives group.effectiveTime via availabilityKey and tradingDay from effectiveTime', async () => {
    const fixture = parityFixture({ period: Period.THIRTY_MIN });
    const decideSpy = jest.spyOn(TradingEngine.prototype, 'decide');

    // 15:00 上海收盘 30m Bar (07:00Z) → availabilityKey 封存为 15:01 上海 (07:01Z)
    const signalBarTs = '2026-01-05T07:00:00.000Z';
    const nextBarTs = '2026-01-06T02:00:00.000Z';
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: [
        makeBar(signalBarTs, Period.THIRTY_MIN, 10.0, 10.2),
        makeBar(nextBarTs, Period.THIRTY_MIN, 10.2, 10.0),
      ],
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(decideSpy).toHaveBeenCalled();
    const firstGroup = decideSpy.mock.calls[0][0];
    const expectedEffective = availabilityKey({
      period: Period.THIRTY_MIN,
      timestamp: new Date(signalBarTs),
    });
    expect(firstGroup.effectiveTime.getTime()).toBe(
      expectedEffective.getTime(),
    );
    expect(firstGroup.tradingDay).toBe(
      formatShanghaiDateString(expectedEffective),
    );
  });

  it('recomputes Next-Bar high-open BUY quantity and propagates macroRegime to decide, surveilBar, and recompute', async () => {
    const elevatedRegime = {
      regime: MarketRiskRegime.ELEVATED_RISK,
      marketAtrPercentile: 0.9,
      isLiquidityFrozen: false,
    };
    const fixture = parityFixture({
      period: Period.DAY,
      contextSnapshot: { macroRegime: elevatedRegime },
    });
    const decideSpy = jest.spyOn(TradingEngine.prototype, 'decide');
    const surveilSpy = jest.spyOn(TradingEngine.prototype, 'surveilBar');
    const submitSpy = jest.spyOn(SimulatedBroker.prototype, 'submitOrder');

    // Bar 1 (01-04 16:00Z = 01-05 00:00+08): close=10.0 -> BUY
    // Bar 2 (01-05 16:00Z = 01-06 00:00+08): open=10.80 (+8% 高开，不触及涨停), close=10.00 (neutral)
    // Bar 3 (01-06 16:00Z = 01-07 00:00+08): close=9.5 -> SELL
    // Bar 4 (01-07 16:00Z = 01-08 00:00+08): open=9.6, close=10.0 -> fill SELL
    const bars: StrategyBar[] = [
      makeBar('2026-01-04T16:00:00.000Z', Period.DAY, 10.0, 10.0),
      makeBar('2026-01-05T16:00:00.000Z', Period.DAY, 10.8, 10.0),
      makeBar('2026-01-06T16:00:00.000Z', Period.DAY, 10.0, 9.5),
      makeBar('2026-01-07T16:00:00.000Z', Period.DAY, 9.6, 10.0),
    ];
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars,
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(decideSpy).toHaveBeenCalled();
    expect(decideSpy.mock.calls[0][2]).toEqual(elevatedRegime);

    expect(surveilSpy).toHaveBeenCalled();
    expect(surveilSpy.mock.calls[0][2]).toEqual(elevatedRegime);

    const buyOrderCall = submitSpy.mock.calls.find(
      ([dto]) => dto.side === ORDER_SIDES.BUY,
    );
    expect(buyOrderCall).toBeDefined();
    const expectedBuyQty = recomputeNextBarOpenBuyQuantity({
      cashLi: yuanToLi(1_000_000),
      fillPriceLi: applySlippageLi(
        yuanToLi(10.8),
        ORDER_SIDES.BUY,
        EXECUTION_RULES.DEFAULT_SLIPPAGE_RATIO,
      ),
      requestedQuantity: 47_500,
      cashAllocationRatio: TRADING_LAYER_DEFAULTS.DEFAULT_CASH_ALLOCATION_RATIO,
      lotSize: TRADING_LAYER_DEFAULTS.DEFAULT_LOT_SIZE,
      securityCode: '600000.SH',
      feeEnabled: true,
      macroRegime: elevatedRegime,
    });
    expect(buyOrderCall![0].quantity).toBe(expectedBuyQty);
    expect(expectedBuyQty).toBeLessThan(47_500);
  });

  it('skips doomed BUY order submission when Next-Bar high-open leaves less than 1 lot affordable', async () => {
    const fixture = parityFixture({ period: Period.DAY });
    const submitSpy = jest.spyOn(SimulatedBroker.prototype, 'submitOrder');

    // Bar 1 close=5000 (5000*100 = 500,000 <= 1,000,000 -> decide emits 100股 BUY)
    // Bar 2 open=10500 (10500*100 > 1,000,000 -> recompute 返回 0 < 100 股 -> 不得下必败单)
    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: [
        makeBar('2026-01-04T16:00:00.000Z', Period.DAY, 5000, 5000),
        makeBar('2026-01-05T16:00:00.000Z', Period.DAY, 10500, 10500),
      ],
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    const buyOrderCalls = submitSpy.mock.calls.filter(
      ([dto]) => dto.side === ORDER_SIDES.BUY,
    );
    expect(buyOrderCalls).toHaveLength(0);
  });

  it('preserves pivotPrice, badgeText, displayTag, styleMeta, and triggerPeriod in BacktestSignalResult contextSnapshot', async () => {
    const fixture = parityFixture({
      period: Period.THIRTY_MIN,
      rule: {
        id: 'term_rich_meta',
        type: 'TERMINAL',
        action: 'BUY',
        signalTag: 'RICH_META',
        reason: '完整展示元数据透传',
        requiredBarCount: 1,
      },
    });
    const styleMeta = { color: '#10b981', position: 'below' as const };
    jest
      .spyOn(
        (await import('@app/strategy')).StrategyEvaluationKernel.prototype,
        'push',
      )
      .mockResolvedValueOnce([
        {
          definitionId: 3,
          versionId: 7,
          signalKind: 'entry',
          triggerPeriod: 30,
          intent: 'ENTRY',
          originPluginId: 'plugin.test.meta',
          signalTime: new Date('2026-01-05T02:00:00.000Z'),
          triggerPrice: 10.2,
          pivotTime: '2026-01-05T01:30:00.000Z',
          pivotPrice: 9.85,
          signalType: 'first_buy',
          badgeText: '1买',
          displayTag: 'CHAN_FIRST_BUY',
          styleMeta,
          decisionTrace: { status: 'SIGNAL_EMITTED', action: 'BUY' },
          contextSnapshot: { action: 'BUY' },
          ruleSnapshot: {},
        },
      ]);

    fixture.dependencies.marketData.readReplayPage.mockResolvedValueOnce({
      bars: [
        makeBar('2026-01-05T02:00:00.000Z', Period.THIRTY_MIN, 10.0, 10.2),
      ],
      nextAfterTimestamp: undefined,
    });

    await fixture.instance.execute(fixture.current.id);

    expect(fixture.dependencies.resultRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        pivotTime: new Date('2026-01-05T01:30:00.000Z'),
        contextSnapshot: expect.objectContaining({
          pivotPrice: 9.85,
          badgeText: '1买',
          displayTag: 'CHAN_FIRST_BUY',
          styleMeta,
          triggerPeriod: 30,
        }),
      }),
    );
  });

  it('passes executionMode next_bar_open, enforceT1, and surveillancePeriods to virtualExitPolicy and settles Next-5m-Bar fills', async () => {
    const strategyMod = await import('@app/strategy');
    const policySpy = jest.spyOn(
      strategyMod.ExternalFactorPluginLoader,
      'createVirtualExitPolicy',
    );
    const sellRuleFlow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'lt', value: 9.0 },
      'exit',
    );
    const buyRuleFlow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
      { field: 'k.close', operator: 'gt', value: 10.0 },
      'entry',
    );
    const fixture = parityFixture({
      period: Period.DAY,
      rule: {
        rootNode: { ...sellRuleFlow, onFail: buyRuleFlow },
        requiredBarCount: 1,
        surveillancePeriods: [5, 1440],
      },
    });
    const d1 = makeBar('2026-01-05T07:00:00.000Z', Period.DAY, 10.0, 10.3);
    const d2Morning5m = makeBar(
      '2026-01-06T01:35:00.000Z',
      Period.FIVE_MIN,
      10.6,
      10.7,
    );
    const d2Close = makeBar('2026-01-06T07:00:00.000Z', Period.DAY, 10.6, 10.8);
    fixture.dependencies.marketData.readReplayPage.mockImplementation(
      async (query: { period: number; afterTimestamp?: Date }) => {
        if (query.afterTimestamp) {
          return { bars: [], nextAfterTimestamp: undefined };
        }
        if (query.period === Period.FIVE_MIN) {
          return { bars: [d2Morning5m], nextAfterTimestamp: undefined };
        }
        return { bars: [d1, d2Close], nextAfterTimestamp: undefined };
      },
    );

    await fixture.instance.execute(fixture.current.id);

    expect(policySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'next_bar_open',
        enforceT1: true,
        surveillancePeriods: [5],
      }),
    );
    expect(
      fixture.dependencies.marketData.loadReplayWindow,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        period: Period.FIVE_MIN,
      }),
    );
  });
});
