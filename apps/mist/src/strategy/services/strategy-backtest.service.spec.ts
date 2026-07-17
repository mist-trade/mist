import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BacktestRunStatus,
  DataSource,
  Period,
  SecurityType,
  StrategyRuleSchemaVersion,
} from '@app/shared-data';
import { StrategyRuleValidator } from '../rules/strategy-rule-validator';
import { StrategyBacktestService } from './strategy-backtest.service';

describe('StrategyBacktestService', () => {
  const createHarness = (options?: {
    backtestEnabled?: boolean;
    benchmarkConfigured?: boolean;
    exitRule?: Record<string, unknown> | null;
    versionDefinitionId?: number;
  }) => {
    const createQueryBuilder = (repository: any) => {
      const builder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawAndEntities: jest.fn(async () => repository.queryResults.shift()),
      };
      repository.builders.push(builder);
      return builder;
    };
    const definition = {
      id: 3,
      currentVersionId: 9,
      backtestEnabled: options?.backtestEnabled ?? true,
      periods: [Period.DAY],
      sources: [DataSource.TDX],
    };
    const strategyVersion = {
      id: 9,
      strategyDefinitionId: options?.versionDefinitionId ?? 3,
      ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
      entryRule: { field: 'k.close', operator: 'gt', value: 100 },
      exitRule:
        options?.exitRule === undefined
          ? { field: 'k.close', operator: 'lt', value: 90 }
          : options.exitRule,
      lookbackBars: 1,
    };
    const definitionRepository = {
      findOne: jest.fn().mockResolvedValue(definition),
    };
    const strategyVersionRepository = {
      findOne: jest.fn(async ({ where }) => {
        if (where.id === 9) return strategyVersion;
        return undefined;
      }),
    };
    const savedRuns: any[] = [];
    const backtestRunRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => {
        const run = input.id ? input : { id: 1, ...input };
        savedRuns.push(run);
        return run;
      }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      queryResults: [] as any[],
      builders: [] as any[],
      createQueryBuilder: jest.fn(),
    };
    const factRepository = {
      find: jest.fn().mockResolvedValue([]),
      queryResults: [] as any[],
      builders: [] as any[],
      createQueryBuilder: jest.fn(),
    };
    backtestRunRepository.createQueryBuilder.mockImplementation(() =>
      createQueryBuilder(backtestRunRepository),
    );
    factRepository.createQueryBuilder.mockImplementation(() =>
      createQueryBuilder(factRepository),
    );
    const securitySourceConfigRepository = {
      findOne: jest.fn().mockResolvedValue(
        options?.benchmarkConfigured === false
          ? undefined
          : {
              id: 1,
              source: DataSource.TDX,
              enabled: true,
              security: { code: '000300', type: SecurityType.INDEX },
            },
      ),
    };
    const service = new StrategyBacktestService(
      definitionRepository as any,
      strategyVersionRepository as any,
      backtestRunRepository as any,
      factRepository as any,
      factRepository as any,
      factRepository as any,
      factRepository as any,
      securitySourceConfigRepository as any,
      new StrategyRuleValidator(),
      {
        parseDateString: (dateStr: string) => {
          if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(dateStr)) {
            throw new BadRequestException(`Invalid date format: ${dateStr}`);
          }
          const normalized = dateStr.includes(' ')
            ? dateStr
            : `${dateStr} 00:00:00`;
          return new Date(`${normalized.replace(' ', 'T')}+08:00`);
        },
      } as any,
    );

    return {
      service,
      definition,
      strategyVersion,
      definitionRepository,
      strategyVersionRepository,
      backtestRunRepository,
      factRepository,
      securitySourceConfigRepository,
      savedRuns,
    };
  };

  const createDto = {
    strategyDefinitionId: 3,
    targetUniverse: ['600519'],
    period: Period.DAY,
    source: DataSource.TDX,
    startDate: '2026-01-01',
    endDate: '2026-06-30',
  };

  it('resolves the current eligible version, snapshots defaults, and enqueues a pending run', async () => {
    const { service, strategyVersionRepository } = createHarness();

    const run = await service.createRun(createDto as any);

    expect(strategyVersionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 9, strategyDefinitionId: 3 },
    });
    expect(run).toMatchObject({
      id: 1,
      status: BacktestRunStatus.PENDING,
      strategyDefinitionId: 3,
      strategyVersionId: 9,
      stage: 'queued',
      configSnapshot: expect.objectContaining({
        initialCash: 1_000_000,
        maxPositions: 10,
        benchmarkCode: '000300',
        executionAssumption: 'full_fill_at_adjusted_next_open',
        priceModel: 'tdx_front',
        limitations: expect.arrayContaining(['dividends_not_modeled']),
        marketDataFingerprintAlgorithm: 'sha256-v1',
      }),
      strategySnapshot: expect.objectContaining({
        entryRule: { field: 'k.close', operator: 'gt', value: 100 },
        exitRule: { field: 'k.close', operator: 'lt', value: 90 },
        lookbackBars: 1,
      }),
    });
  });

  it('parses start and end dates as Beijing midnight so persisted K bars on the first day are included', async () => {
    const { service, savedRuns } = createHarness();

    await service.createRun({
      ...createDto,
      startDate: '2026-01-01',
      endDate: '2026-01-01',
    } as any);

    // Beijing 2026-01-01 00:00:00 == UTC 2025-12-31T16:00:00Z.
    // Persisted QMT/TDX daily K for that trading day carries this exact
    // instant, so a >= run.startDate filter must keep it in range.
    expect(savedRuns).toHaveLength(1);
    expect(savedRuns[0].startDate.toISOString()).toBe(
      '2025-12-31T16:00:00.000Z',
    );
    expect(savedRuns[0].endDate.toISOString()).toBe('2025-12-31T16:00:00.000Z');
  });

  it('uses an explicit version only when it belongs to the selected definition', async () => {
    const { service, strategyVersionRepository } = createHarness({
      versionDefinitionId: 4,
    });

    await expect(
      service.createRun({ ...createDto, strategyVersionId: 9 } as any),
    ).rejects.toThrow(NotFoundException);
    expect(strategyVersionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 9, strategyDefinitionId: 3 },
    });
  });

  it('rejects disabled definitions and versions without a valid exit rule before persistence', async () => {
    const disabled = createHarness({ backtestEnabled: false });
    const noExit = createHarness({ exitRule: null });

    await expect(disabled.service.createRun(createDto as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(noExit.service.createRun(createDto as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(disabled.savedRuns).toHaveLength(0);
    expect(noExit.savedRuns).toHaveLength(0);
  });

  it('rejects requests outside the daily, 50-security, configured-source, and 10-year envelope', async () => {
    const { service } = createHarness();

    await expect(
      service.createRun({
        ...createDto,
        targetUniverse: Array.from({ length: 51 }, (_, index) =>
          String(index).padStart(6, '0'),
        ),
        period: Period.ONE_MIN,
        source: DataSource.QMT,
        endDate: '2037-01-02',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects EF even when the definition lists it as configured', async () => {
    const { service, definition, savedRuns } = createHarness();
    definition.sources = [DataSource.EAST_MONEY];

    await expect(
      service.createRun({
        ...createDto,
        source: DataSource.EAST_MONEY,
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(savedRuns).toHaveLength(0);
  });

  it('rejects an empty target universe before a pending run is persisted', async () => {
    const { service, savedRuns } = createHarness();

    await expect(
      service.createRun({ ...createDto, targetUniverse: [] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(savedRuns).toHaveLength(0);
  });

  it('rejects non-canonical target codes before a pending run is persisted', async () => {
    const { service, savedRuns } = createHarness();

    await expect(
      service.createRun({ ...createDto, targetUniverse: ['600519.SH'] } as any),
    ).rejects.toThrow(BadRequestException);

    expect(savedRuns).toHaveLength(0);
  });

  it('rejects a benchmark that is not a configured selected-source index before persistence', async () => {
    const { service, savedRuns, securitySourceConfigRepository } =
      createHarness({
        benchmarkConfigured: false,
      });

    await expect(
      service.createRun({ ...createDto, benchmarkCode: '600519' } as any),
    ).rejects.toThrow(BadRequestException);

    expect(securitySourceConfigRepository.findOne).toHaveBeenCalledWith({
      where: {
        source: DataSource.TDX,
        enabled: true,
        security: { code: '600519', type: SecurityType.INDEX },
      },
      relations: ['security'],
    });
    expect(savedRuns).toHaveLength(0);
  });

  it('cancels a pending run immediately and requests cooperative cancellation for a running run', async () => {
    const { service, backtestRunRepository } = createHarness();
    const cancelledPendingRun = {
      id: 1,
      status: BacktestRunStatus.CANCELLED,
      stage: 'finalizing',
      completedAt: new Date(),
    };
    const cancellationRequestedRun = {
      id: 2,
      status: BacktestRunStatus.RUNNING,
      stage: 'simulating',
      cancelRequestedAt: new Date(),
    };
    backtestRunRepository.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 });
    backtestRunRepository.findOne
      .mockResolvedValueOnce(cancelledPendingRun)
      .mockResolvedValueOnce(cancellationRequestedRun);

    await expect(service.cancelRun(1)).resolves.toMatchObject({
      status: BacktestRunStatus.CANCELLED,
      completedAt: expect.any(Date),
    });
    await expect(service.cancelRun(2)).resolves.toMatchObject({
      status: BacktestRunStatus.RUNNING,
      cancelRequestedAt: expect.any(Date),
    });
    expect(backtestRunRepository.update).toHaveBeenNthCalledWith(
      1,
      { id: 1, status: BacktestRunStatus.PENDING },
      expect.objectContaining({
        status: BacktestRunStatus.CANCELLED,
        cancelRequestedAt: expect.any(Date),
        completedAt: expect.any(Date),
      }),
    );
    expect(backtestRunRepository.update).toHaveBeenNthCalledWith(
      3,
      { id: 2, status: BacktestRunStatus.RUNNING },
      { cancelRequestedAt: expect.any(Date) },
    );
  });

  it('returns a concurrently completed run instead of restoring a stale running state', async () => {
    const { service, backtestRunRepository } = createHarness();
    const completedRun = {
      id: 2,
      status: BacktestRunStatus.COMPLETED,
      completedAt: new Date('2026-06-30T00:00:00.000Z'),
      leaseOwner: null,
      metrics: { totalReturn: 0.1 },
    };
    backtestRunRepository.update
      .mockResolvedValueOnce({ affected: 0 })
      .mockResolvedValueOnce({ affected: 1 });
    backtestRunRepository.findOne.mockResolvedValue(completedRun);

    await expect(service.cancelRun(2)).resolves.toEqual(completedRun);

    expect(backtestRunRepository.save).not.toHaveBeenCalled();
    expect(backtestRunRepository.update).toHaveBeenNthCalledWith(
      2,
      { id: 2, status: BacktestRunStatus.RUNNING },
      { cancelRequestedAt: expect.any(Date) },
    );
  });

  it('leaves completed, failed, and cancelled runs immutable on repeated cancellation', async () => {
    const { service, backtestRunRepository } = createHarness();
    const terminalRun = {
      id: 3,
      status: BacktestRunStatus.COMPLETED,
      completedAt: new Date('2026-06-30T00:00:00.000Z'),
      metrics: { totalReturn: 0.1 },
    };
    backtestRunRepository.findOne.mockResolvedValue(terminalRun);
    const saveCallCount = backtestRunRepository.save.mock.calls.length;

    await expect(service.cancelRun(3)).resolves.toEqual(terminalRun);

    expect(backtestRunRepository.save).toHaveBeenCalledTimes(saveCallCount);
    expect(terminalRun).toEqual({
      id: 3,
      status: BacktestRunStatus.COMPLETED,
      completedAt: new Date('2026-06-30T00:00:00.000Z'),
      metrics: { totalReturn: 0.1 },
    });
  });

  it('returns stable, bounded pages with date/id cursors and rejects invalid cursors', async () => {
    const { service, backtestRunRepository, factRepository } = createHarness();
    backtestRunRepository.findOne.mockResolvedValue({
      id: 1,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
    });
    factRepository.queryResults.push(
      {
        entities: [
          { id: 1, signalTime: new Date('2026-01-02') },
          { id: 2, signalTime: new Date('2026-01-02') },
          { id: 3, signalTime: new Date('2026-01-03') },
        ],
        raw: [
          { backtest_cursor_time: '2026-01-02 00:00:00.000000' },
          { backtest_cursor_time: '2026-01-02 00:00:00.000000' },
          { backtest_cursor_time: '2026-01-03 00:00:00.000000' },
        ],
      },
      {
        entities: [{ id: 3, signalTime: new Date('2026-01-03') }],
        raw: [{ backtest_cursor_time: '2026-01-03 00:00:00.000000' }],
      },
    );

    const firstPage = await service.listSignals(1, { limit: 2 });
    const secondPage = await service.listSignals(1, {
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(firstPage).toMatchObject({
      items: [{ id: 1 }, { id: 2 }],
      nextCursor: expect.any(String),
    });
    expect(secondPage).toEqual({
      items: [{ id: 3, signalTime: new Date('2026-01-03') }],
      nextCursor: null,
    });
    expect(factRepository.builders[0].take).toHaveBeenCalledWith(3);
    expect(factRepository.builders[1].andWhere).toHaveBeenCalledWith(
      expect.stringContaining('signal.signalTime > :cursorTime'),
      expect.objectContaining({
        cursorTime: '2026-01-02 00:00:00.000000',
        cursorId: 2,
      }),
    );
    await expect(
      service.listSignals(1, { cursor: 'not-a-cursor' }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.listSignals(1, { limit: 201 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('filters newest-first run history and rejects invalid as-of queries without exposing another run', async () => {
    const { service, backtestRunRepository } = createHarness({
      backtestEnabled: false,
    });
    backtestRunRepository.queryResults.push(
      {
        entities: [
          { id: 3, createTime: new Date('2026-06-30') },
          { id: 2, createTime: new Date('2026-06-30') },
          { id: 1, createTime: new Date('2026-06-29') },
        ],
        raw: [
          { backtest_cursor_time: '2026-06-30 00:00:00.123456' },
          { backtest_cursor_time: '2026-06-30 00:00:00.123456' },
          { backtest_cursor_time: '2026-06-29 00:00:00.999999' },
        ],
      },
      {
        entities: [{ id: 1, createTime: new Date('2026-06-29') }],
        raw: [{ backtest_cursor_time: '2026-06-29 00:00:00.999999' }],
      },
    );

    const firstPage = await service.listRuns({
      strategyDefinitionId: 3,
      status: BacktestRunStatus.COMPLETED,
      limit: 2,
    });
    const secondPage = await service.listRuns({
      strategyDefinitionId: 3,
      status: BacktestRunStatus.COMPLETED,
      limit: 2,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(backtestRunRepository.builders[0].andWhere).toHaveBeenCalledWith(
      'run.strategyDefinitionId = :strategyDefinitionId',
      { strategyDefinitionId: 3 },
    );
    expect(backtestRunRepository.builders[0].andWhere).toHaveBeenCalledWith(
      'run.status = :status',
      { status: BacktestRunStatus.COMPLETED },
    );
    expect(firstPage.items.map((run) => run.id)).toEqual([3, 2]);
    expect(secondPage.items.map((run) => run.id)).toEqual([1]);

    backtestRunRepository.findOne.mockResolvedValue({
      id: 1,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
    });
    await expect(service.listPositions(1, 'not-a-date')).rejects.toThrow(
      BadRequestException,
    );

    backtestRunRepository.findOne.mockResolvedValue(undefined);
    await expect(service.listSignals(999)).rejects.toThrow(NotFoundException);
  });

  it('uses the latest simulated equity date for end-position reconstruction', async () => {
    const { service, backtestRunRepository, factRepository } = createHarness();
    backtestRunRepository.findOne.mockResolvedValue({
      id: 1,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-05'),
    });
    factRepository.find.mockResolvedValueOnce([
      { id: 10, pointTime: new Date('2026-01-03') },
    ]);
    factRepository.queryResults.push({
      entities: [
        {
          id: 1,
          entryTime: new Date('2026-01-01'),
          exitTime: new Date('2026-01-04'),
        },
        {
          id: 2,
          entryTime: new Date('2026-01-01'),
          exitTime: null,
        },
      ],
      raw: [
        { backtest_cursor_time: '2026-01-01 00:00:00.000000' },
        { backtest_cursor_time: '2026-01-01 00:00:00.000000' },
      ],
    });

    const positions = await service.listPositions(1);

    expect(positions.items.map((position) => position.id)).toEqual([1, 2]);
  });

  it('serializes result payloads without BigInt, NaN, or Infinity leaks', async () => {
    const { service, backtestRunRepository } = createHarness();
    backtestRunRepository.findOne.mockResolvedValue({
      id: 1,
      progressPercent: '25.00',
      metrics: { sharpeRatio: Number.POSITIVE_INFINITY, winRate: Number.NaN },
      errorDetails: { retryCount: 1n, commission: 'provider unavailable' },
    });

    const run = await service.findRun(1);

    expect(run).toMatchObject({
      progressPercent: 25,
      metrics: { sharpeRatio: null, winRate: null },
      // bigint is still stringified (JSON-safe), but the diagnostic string
      // whose key happens to match a decimal column name must survive intact
      // rather than being coerced to null.
      errorDetails: { retryCount: '1', commission: 'provider unavailable' },
    });
    expect(() => JSON.stringify(run)).not.toThrow();
  });

  it('normalizes MySQL decimal strings in portfolio fact payloads', async () => {
    const { service, backtestRunRepository, factRepository } = createHarness();
    backtestRunRepository.findOne.mockResolvedValue({ id: 1 });
    factRepository.queryResults.push({
      entities: [
        {
          id: 1,
          scheduledTime: new Date('2026-01-02T00:00:00.000Z'),
          fillPrice: '120.05',
          grossAmount: '12005.00',
          commission: '5.00',
          stampDuty: '0.00',
          transferFee: '0.12',
          totalFee: '5.12',
        },
      ],
      raw: [{ backtest_cursor_time: '2026-01-02 00:00:00.000000' }],
    });

    const page = await service.listOrders(1);

    expect(page.items[0]).toMatchObject({
      fillPrice: 120.05,
      grossAmount: 12_005,
      commission: 5,
      stampDuty: 0,
      transferFee: 0.12,
      totalFee: 5.12,
    });
  });
});
