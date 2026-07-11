import {
  BacktestRun,
  BacktestRunStage,
  BacktestRunStatus,
} from '@app/shared-data';
import { StrategyBacktestEngine } from './strategy-backtest.engine';
import { StrategyBacktestProcessor } from './strategy-backtest.processor';

describe('StrategyBacktestProcessor', () => {
  const createRun = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    status: BacktestRunStatus.PENDING,
    stage: BacktestRunStage.QUEUED,
    attemptCount: 0,
    processedWork: 0,
    totalWork: 0,
    progressPercent: 0,
    targetUniverse: ['600519'],
    period: 1440,
    source: 'tdx',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-31T00:00:00.000Z'),
    strategySnapshot: {
      entryRule: { field: 'k.close', operator: 'gt', value: 100 },
      exitRule: { field: 'k.close', operator: 'lt', value: 90 },
      lookbackBars: 1,
    },
    configSnapshot: {
      initialCash: 1_000_000,
      maxPositions: 10,
      slippageBps: 5,
      commissionRate: 0.0003,
      minCommission: 5,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
      benchmarkCode: '000300',
    },
    ...overrides,
  });

  const createHarness = (
    candidate: Record<string, unknown> | null,
    kRows: Record<string, unknown>[] = [],
    engine: StrategyBacktestEngine = new StrategyBacktestEngine(),
  ) => {
    const query = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(candidate),
    };
    const managerRunRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      findOne: jest.fn(async () => candidate),
      save: jest.fn(async (run) => run),
    };
    const manager = {
      getRepository: jest.fn(),
      delete: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => await callback(manager)),
    };
    const runRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (run) => run),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const factRepository = {
      create: jest.fn((input) => input),
      save: jest.fn(async (input) => input),
      delete: jest.fn(),
    };
    manager.getRepository.mockImplementation((target: unknown) =>
      target === BacktestRun ? managerRunRepository : factRepository,
    );
    const kRepository = {
      find: jest.fn().mockResolvedValue(kRows),
    };
    const processor = new StrategyBacktestProcessor(
      dataSource as any,
      runRepository as any,
      factRepository as any,
      factRepository as any,
      factRepository as any,
      factRepository as any,
      kRepository as any,
      engine,
    );

    return {
      processor,
      query,
      manager,
      managerRunRepository,
      dataSource,
      runRepository,
      factRepository,
      kRepository,
    };
  };

  const createKRow = (
    code: string,
    type: string,
    day: number,
    close: number,
  ) => ({
    security: { code, type },
    source: 'tdx',
    period: 1440,
    timestamp: new Date(Date.UTC(2026, 0, day)),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000n,
    amount: close * 1_000,
  });

  it('claims one pending run under a MySQL write lock and records a renewable lease', async () => {
    const run = createRun();
    const { processor, query, managerRunRepository } = createHarness(run);

    const claimed = await (processor as any).claimNextRun();

    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(claimed).toMatchObject({
      id: 1,
      status: BacktestRunStatus.RUNNING,
      stage: BacktestRunStage.LOADING_DATA,
      attemptCount: 1,
      leaseOwner: expect.any(String),
      leaseExpiresAt: expect.any(Date),
      leaseHeartbeatAt: expect.any(Date),
    });
    expect(managerRunRepository.save).toHaveBeenCalledWith(claimed);
  });

  it('does not claim a pending run when no candidate is available', async () => {
    const { processor, managerRunRepository } = createHarness(null);

    await expect((processor as any).claimNextRun()).resolves.toBeNull();
    expect(managerRunRepository.save).not.toHaveBeenCalled();
  });

  it('allows at most one active processNext call per processor instance', async () => {
    const { processor, dataSource } = createHarness(null);

    const results = await Promise.all([
      processor.processNext(),
      processor.processNext(),
    ]);

    expect(results).toEqual([false, false]);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('contains a scheduled processing failure instead of leaking an unhandled rejection', async () => {
    const { processor } = createHarness(null);
    const failure = new Error('temporary database failure');
    const loggerError = jest
      .spyOn((processor as any).logger, 'error')
      .mockImplementation();
    jest.spyOn(processor, 'processNext').mockRejectedValue(failure);

    await (processor as any).processScheduledRun();

    expect(loggerError).toHaveBeenCalledWith(
      'Strategy backtest processor cycle failed',
      failure.stack,
    );
  });

  it('updates bounded stage, progress, and lease heartbeat while retaining ownership', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      leaseOwner: 'processor-1',
    });
    const { processor, runRepository } = createHarness(null);

    await (processor as any).heartbeat(
      run,
      BacktestRunStage.SIMULATING,
      25,
      100,
    );

    expect(run).toMatchObject({
      stage: BacktestRunStage.SIMULATING,
      processedWork: 25,
      totalWork: 100,
      progressPercent: 25,
      leaseHeartbeatAt: expect.any(Date),
      leaseExpiresAt: expect.any(Date),
    });
    expect(runRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: run.id,
        status: BacktestRunStatus.RUNNING,
        leaseOwner: 'processor-1',
        leaseExpiresAt: expect.objectContaining({ _type: 'moreThan' }),
      }),
      expect.objectContaining({
        stage: BacktestRunStage.SIMULATING,
        processedWork: 25,
        totalWork: 100,
        progressPercent: 25,
      }),
    );
  });

  it('does not mutate a run after its MySQL lease ownership is lost', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      leaseOwner: 'processor-1',
    });
    const { processor, runRepository } = createHarness(null);
    runRepository.update.mockResolvedValue({ affected: 0 });

    await expect(
      (processor as any).heartbeat(run, BacktestRunStage.SIMULATING, 25, 100),
    ).rejects.toThrow('BACKTEST_LEASE_LOST');
    expect(runRepository.save).not.toHaveBeenCalled();
  });

  it('fences fact writes behind a locked unexpired lease', async () => {
    const run = createRun();
    const { processor, factRepository, managerRunRepository } = createHarness(
      run,
      [
        createKRow('600519', 'STOCK', 1, 110),
        createKRow('600519', 'STOCK', 2, 120),
        createKRow('000300', 'INDEX', 1, 100),
        createKRow('000300', 'INDEX', 2, 110),
      ],
    );
    managerRunRepository.findOne.mockImplementation(async () => ({
      ...run,
      leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    }));

    await expect(processor.processNext()).resolves.toBe(true);

    expect(managerRunRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(factRepository.save).not.toHaveBeenCalled();
  });

  it('loads persisted K data, runs the pure engine, and persists auditable facts before completion', async () => {
    const run = createRun();
    const { processor, kRepository, factRepository } = createHarness(run, [
      createKRow('600519', 'STOCK', 1, 110),
      createKRow('600519', 'STOCK', 2, 120),
      createKRow('000300', 'INDEX', 1, 100),
      createKRow('000300', 'INDEX', 2, 110),
    ]);

    await expect(processor.processNext()).resolves.toBe(true);

    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: ['security'] }),
    );
    expect(factRepository.save).toHaveBeenCalled();
    expect(run).toMatchObject({
      status: BacktestRunStatus.COMPLETED,
      progressPercent: 100,
      completedAt: expect.any(Date),
      metrics: expect.any(Object),
    });
  });

  it('persists aggregate signal counts with the completed terminal state', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      leaseOwner: 'processor-1',
      signalCount: 7,
      matchedSecurityCount: 3,
    });
    const { processor, runRepository } = createHarness(null);

    await (processor as any).completeRun(run, { metrics: { tradeCount: 4 } });

    expect(runRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: run.id,
        status: BacktestRunStatus.RUNNING,
        leaseOwner: 'processor-1',
      }),
      expect.objectContaining({
        status: BacktestRunStatus.COMPLETED,
        signalCount: 7,
        matchedSecurityCount: 3,
      }),
    );
  });

  it('fails with structured missing-code coverage details before invoking the engine', async () => {
    const run = createRun();
    const { processor, factRepository } = createHarness(run, []);

    await expect(processor.processNext()).resolves.toBe(true);

    expect(run).toMatchObject({
      status: BacktestRunStatus.FAILED,
      errorCode: 'BACKTEST_DATA_COVERAGE_MISSING',
      errorDetails: { missingCodes: ['000300', '600519'] },
    });
    expect(factRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a non-index benchmark while retaining source-specific persisted-K access', async () => {
    const run = createRun();
    const { processor, kRepository, factRepository } = createHarness(run, [
      createKRow('600519', 'STOCK', 1, 110),
      createKRow('600519', 'STOCK', 2, 120),
      createKRow('000300', 'STOCK', 1, 100),
      createKRow('000300', 'STOCK', 2, 110),
    ]);

    await expect(processor.processNext()).resolves.toBe(true);

    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: 'tdx' }),
      }),
    );
    expect(run).toMatchObject({
      status: BacktestRunStatus.FAILED,
      errorCode: 'BACKTEST_BENCHMARK_TYPE_UNSUPPORTED',
      errorDetails: { code: '000300', type: 'STOCK' },
    });
    expect(factRepository.save).not.toHaveBeenCalled();
  });

  it('rejects non-stock target securities before writing any portfolio facts', async () => {
    const run = createRun();
    const { processor, factRepository } = createHarness(run, [
      createKRow('600519', 'INDEX', 1, 110),
      createKRow('600519', 'INDEX', 2, 120),
      createKRow('000300', 'INDEX', 1, 100),
      createKRow('000300', 'INDEX', 2, 110),
    ]);

    await expect(processor.processNext()).resolves.toBe(true);

    expect(run).toMatchObject({
      status: BacktestRunStatus.FAILED,
      errorCode: 'BACKTEST_SECURITY_TYPE_UNSUPPORTED',
      errorDetails: { codes: ['600519'] },
    });
    expect(factRepository.save).not.toHaveBeenCalled();
  });

  it('uses persisted gaps to wait for the next available target open without external fetches', async () => {
    const run = createRun({
      endDate: new Date('2026-01-03T00:00:00.000Z'),
    });
    const { processor, factRepository } = createHarness(run, [
      createKRow('600519', 'STOCK', 1, 110),
      createKRow('600519', 'STOCK', 3, 120),
      createKRow('000300', 'INDEX', 1, 100),
      createKRow('000300', 'INDEX', 2, 105),
      createKRow('000300', 'INDEX', 3, 110),
    ]);
    const originalFetch = global.fetch;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    try {
      await expect(processor.processNext()).resolves.toBe(true);
    } finally {
      global.fetch = originalFetch;
    }

    const orderRows = factRepository.save.mock.calls
      .map(([rows]) => rows)
      .find(
        (rows) =>
          Array.isArray(rows) && rows.some((row) => 'scheduledTime' in row),
      );
    expect(orderRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          securityCode: '600519',
          executionTime: new Date('2026-01-03T00:00:00.000Z'),
        }),
      ]),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('retains one extra warmup bar so the first replay crossover has a prior completed context', () => {
    const run = createRun({
      startDate: new Date('2026-01-14T00:00:00.000Z'),
      strategySnapshot: {
        entryRule: {
          field: 'indicator.ma13',
          operator: 'crossesAbove',
          value: 105,
        },
        exitRule: null,
        lookbackBars: 12,
      },
    });
    const { processor } = createHarness(null);
    const rows = Array.from({ length: 14 }, (_, index) =>
      createKRow('600519', 'STOCK', index + 1, index === 13 ? 200 : 100),
    );

    const selected = (processor as any).selectReplayRows(rows, run, 12);

    expect(selected).toHaveLength(14);
    expect(selected[0].timestamp).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(selected.at(-1).timestamp).toEqual(run.startDate);
  });

  it('clears partial run-owned facts before reclaiming an expired lease', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      stage: BacktestRunStage.SIMULATING,
      attemptCount: 2,
      leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      metrics: { totalReturn: 1 },
      signalCount: 5,
      matchedSecurityCount: 1,
    });
    const { processor, manager } = createHarness(run);

    const claimed = await (processor as any).claimNextRun();

    expect(manager.delete).toHaveBeenCalledTimes(4);
    expect(claimed).toMatchObject({
      status: BacktestRunStatus.RUNNING,
      stage: BacktestRunStage.LOADING_DATA,
      attemptCount: 3,
      signalCount: 0,
      matchedSecurityCount: 0,
      metrics: null,
      progressPercent: 0,
    });
  });

  it('finalizes an expired cancellation instead of restarting its immutable snapshot', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      stage: BacktestRunStage.SIMULATING,
      attemptCount: 2,
      leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      cancelRequestedAt: new Date('2026-01-02T00:00:00.000Z'),
      metrics: { totalReturn: 1 },
    });
    const { processor, manager, managerRunRepository } = createHarness(run);

    await expect((processor as any).claimNextRun()).resolves.toBeNull();

    expect(manager.delete).not.toHaveBeenCalled();
    expect(managerRunRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: BacktestRunStatus.CANCELLED,
        completedAt: expect.any(Date),
        leaseOwner: null,
      }),
    );
    expect(run).toMatchObject({
      status: BacktestRunStatus.CANCELLED,
      attemptCount: 2,
      metrics: { totalReturn: 1 },
    });
  });

  it('observes a running cancellation before fact persistence and leaves no partial output', async () => {
    const run = createRun();
    const { processor, runRepository, factRepository } = createHarness(run, [
      createKRow('600519', 'STOCK', 1, 110),
      createKRow('600519', 'STOCK', 2, 120),
      createKRow('000300', 'INDEX', 1, 100),
      createKRow('000300', 'INDEX', 2, 110),
    ]);
    runRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: run.id,
        cancelRequestedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

    await expect(processor.processNext()).resolves.toBe(true);

    expect(run).toMatchObject({
      status: BacktestRunStatus.CANCELLED,
      completedAt: expect.any(Date),
      leaseOwner: null,
    });
    expect(factRepository.save).not.toHaveBeenCalled();
    expect(factRepository.delete).not.toHaveBeenCalled();
  });

  it('observes cancellation at the next fact batch boundary and stops later writes', async () => {
    const run = createRun();
    const output = {
      signals: Array.from({ length: 501 }, (_, index) => ({
        signalIndex: index + 1,
        securityCode: '600519',
        signalKind: 'entry',
        signalTime: new Date(Date.UTC(2026, 0, 2)),
        contextSnapshot: { k: { close: 120 } },
        ruleSnapshot: { field: 'k.close', operator: 'gt', value: 100 },
      })),
      orders: [],
      trades: [],
      equityPoints: [],
      metrics: {},
    };
    const engine = {
      runInBatches: jest.fn(
        async (
          _input: unknown,
          _batchSize: number,
          onBatch: (batch: {
            processedWork: number;
            totalWork: number;
          }) => Promise<void>,
        ) => {
          await onBatch({ processedWork: 2, totalWork: 2 });
          return output;
        },
      ),
    } as any;
    const { processor, runRepository, factRepository } = createHarness(
      run,
      [
        createKRow('600519', 'STOCK', 1, 110),
        createKRow('600519', 'STOCK', 2, 120),
        createKRow('000300', 'INDEX', 1, 100),
        createKRow('000300', 'INDEX', 2, 110),
      ],
      engine,
    );
    runRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: run.id,
        cancelRequestedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

    await expect(processor.processNext()).resolves.toBe(true);

    expect(factRepository.save).toHaveBeenCalledTimes(1);
    expect(factRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ backtestRunId: run.id }),
      ]),
    );
    expect(run).toMatchObject({
      status: BacktestRunStatus.CANCELLED,
      completedAt: expect.any(Date),
      leaseOwner: null,
    });
    expect(factRepository.delete).not.toHaveBeenCalled();
  });

  it('keeps already persisted aggregate output immutable when cancellation becomes terminal', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      stage: BacktestRunStage.FINALIZING,
      leaseOwner: 'processor-1',
      signalCount: 5,
      matchedSecurityCount: 1,
      metrics: { totalReturn: 0.1 },
    });
    const { processor, factRepository } = createHarness(null);

    await (processor as any).cancelRun(run);

    expect(run).toMatchObject({
      status: BacktestRunStatus.CANCELLED,
      signalCount: 5,
      matchedSecurityCount: 1,
      metrics: { totalReturn: 0.1 },
      completedAt: expect.any(Date),
    });
    expect(factRepository.delete).not.toHaveBeenCalled();
  });

  it('does not delete persisted facts after a run becomes failed', async () => {
    const run = createRun({
      status: BacktestRunStatus.RUNNING,
      leaseOwner: 'processor-1',
      signalCount: 3,
    });
    const { processor, factRepository } = createHarness(null);

    await (processor as any).failRun(run, new Error('persistence failed'));

    expect(run).toMatchObject({
      status: BacktestRunStatus.FAILED,
      errorCode: 'BACKTEST_PROCESSING_FAILED',
      completedAt: expect.any(Date),
    });
    expect(factRepository.delete).not.toHaveBeenCalled();
  });
});
