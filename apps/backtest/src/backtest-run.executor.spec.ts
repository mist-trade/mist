import {
  BacktestRunStatus,
  DataSource,
  Period,
  StrategyRuleSchemaVersion,
} from '@app/shared-data';
import {
  compileStoredDefinitionVersion,
  shanghaiMidnight,
  type DailyNavSnapshot,
} from '@app/strategy';
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

  it('replays a decision_flow plan and saves confidence and decisionTrace', async () => {
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
      kind: 'rule_dsl',
    };
    fixture.dependencies.runRepository.findOne.mockResolvedValue(run);
    fixture.dependencies.versionRepository.findOne.mockResolvedValue({
      id: 7,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      // Bar 1 close = 10 > 5 -> 发出 ENTRY 信号
      rule: { field: 'k.close', operator: 'gt', value: 5 },
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
      // Bar 3 (01-06): close 9.10 -> 跌幅 -9% 跌破 -8% 硬止损线，裁决器生成硬止损卖单
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
      // Bar 4 (01-07): open 9.0 -> Next-Bar 撮合成交卖出，出场原因 HARD_STOP_LOSS
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

    // 验证交易流水记录，且 exitReason 精确记录为 HARD_STOP_LOSS
    expect(fixture.dependencies.tradeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        backtestRunId: 41,
        securityCode: '600000.SH',
        exitReason: 'HARD_STOP_LOSS',
      }),
    );
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
