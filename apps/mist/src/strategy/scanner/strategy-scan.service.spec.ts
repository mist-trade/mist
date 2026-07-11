import {
  DataSource,
  Period,
  StrategyAlertStatus,
  StrategySignalKind,
  StrategySignal,
  StrategySignalSource,
  StrategyStatus,
} from '@app/shared-data';
import { StrategyEvaluationContextBuilder } from './strategy-evaluation-context.builder';
import { StrategyScanService } from './strategy-scan.service';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';

describe('StrategyScanService', () => {
  const signalTime = new Date('2026-07-07T09:30:00.000Z');
  const createHarness = (existingAlert = false) => {
    const strategy = {
      id: 1,
      status: StrategyStatus.ENABLED,
      targetUniverse: ['600519'],
      periods: [Period.DAY],
      sources: [DataSource.TDX],
      currentVersionId: 7,
      backtestEnabled: false,
    };
    const version = {
      id: 7,
      strategyDefinitionId: 1,
      entryRule: { field: 'k.close', operator: 'gt', value: 100 },
      exitRule: { field: 'k.close', operator: 'lt', value: 90 },
      lookbackBars: 1,
    };
    const k = {
      id: 10,
      security: { code: '600519', type: 'STOCK' },
      source: DataSource.TDX,
      period: Period.DAY,
      timestamp: signalTime,
      open: 101,
      high: 125,
      low: 99,
      close: 120,
      volume: 1000n,
      amount: 120000,
    };
    const definitionRepository = {
      find: jest.fn().mockResolvedValue([strategy]),
    };
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(version),
    };
    const kRepository = {
      findOne: jest.fn().mockResolvedValue(k),
      find: jest.fn().mockResolvedValue([k]),
    };
    const signalRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => ({ id: 2, ...input })),
    };
    const alertEventRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue(existingAlert ? { id: 9 } : undefined),
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (input) => ({ id: 3, ...input })),
    };
    const transactionManager = {
      getRepository: jest.fn((target) =>
        target === StrategySignal ? signalRepository : alertEventRepository,
      ),
    };
    const typeOrmDataSource = {
      transaction: jest.fn(
        async (callback) => await callback(transactionManager),
      ),
    };
    const service = new StrategyScanService(
      typeOrmDataSource as any,
      definitionRepository as any,
      versionRepository as any,
      kRepository as any,
      new StrategyEvaluationContextBuilder(),
      new StrategyRuleEvaluator(),
    );

    return {
      service,
      definitionRepository,
      versionRepository,
      kRepository,
      signalRepository,
      alertEventRepository,
      typeOrmDataSource,
    };
  };

  it('persists a live signal and pending alert event when an enabled strategy matches', async () => {
    const { service, signalRepository, alertEventRepository } = createHarness();

    const result = await service.runScan({});

    expect(result).toEqual({
      scannedStrategies: 1,
      evaluatedContexts: 1,
      createdSignals: 1,
      createdAlertEvents: 1,
      skippedDuplicates: 0,
    });
    expect(signalRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        strategyDefinitionId: 1,
        strategyVersionId: 7,
        securityCode: '600519',
        period: Period.DAY,
        source: DataSource.TDX,
        signalTime,
        signalSource: StrategySignalSource.LIVE,
        signalKind: StrategySignalKind.ENTRY,
      }),
    );
    expect(alertEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySignalId: 2,
        status: StrategyAlertStatus.PENDING,
        dedupeKey: '1:7:600519:1440:tdx:2026-07-07T09:30:00.000Z:entry',
      }),
    );
  });

  it('skips duplicate alert candidates without creating another signal', async () => {
    const { service, signalRepository, alertEventRepository } =
      createHarness(true);

    const result = await service.runScan({});

    expect(result).toMatchObject({
      createdSignals: 0,
      createdAlertEvents: 0,
      skippedDuplicates: 1,
    });
    expect(signalRepository.save).not.toHaveBeenCalled();
    expect(alertEventRepository.save).not.toHaveBeenCalled();
  });

  it('treats a transactional duplicate-key race as a skipped signal', async () => {
    const {
      service,
      signalRepository,
      alertEventRepository,
      typeOrmDataSource,
    } = createHarness();
    alertEventRepository.save.mockRejectedValue({
      code: 'ER_DUP_ENTRY',
      constraint: 'uq_strategy_alert_events_dedupe_key',
    });

    const result = await service.runScan({});

    expect(result).toMatchObject({
      createdSignals: 0,
      createdAlertEvents: 0,
      skippedDuplicates: 1,
    });
    expect(typeOrmDataSource.transaction).toHaveBeenCalledTimes(1);
    expect(signalRepository.save).toHaveBeenCalledTimes(1);
    expect(alertEventRepository.save).toHaveBeenCalledTimes(1);
  });

  it('persists exit then entry when both paired rules match at one timestamp', async () => {
    const {
      service,
      signalRepository,
      alertEventRepository,
      versionRepository,
    } = createHarness();
    versionRepository.findOne.mockResolvedValue({
      id: 7,
      strategyDefinitionId: 1,
      entryRule: { field: 'k.close', operator: 'gt', value: 100 },
      exitRule: { field: 'k.close', operator: 'gt', value: 100 },
      lookbackBars: 1,
    });

    const result = await service.runScan({});

    expect(result).toMatchObject({
      createdSignals: 2,
      createdAlertEvents: 2,
      skippedDuplicates: 0,
    });
    expect(
      signalRepository.save.mock.calls.map(([signal]) => signal.signalKind),
    ).toEqual([StrategySignalKind.EXIT, StrategySignalKind.ENTRY]);
    expect(
      alertEventRepository.save.mock.calls.map(([event]) => event.dedupeKey),
    ).toEqual([
      '1:7:600519:1440:tdx:2026-07-07T09:30:00.000Z:exit',
      '1:7:600519:1440:tdx:2026-07-07T09:30:00.000Z:entry',
    ]);
  });

  it('retains one additional completed bar so an indicator crossover can match on the first replay date', async () => {
    const { service, kRepository, signalRepository, versionRepository } =
      createHarness();
    const history = Array.from({ length: 14 }, (_, index) => ({
      id: index + 1,
      security: { code: '600519', type: 'STOCK' },
      source: DataSource.TDX,
      period: Period.DAY,
      timestamp: new Date(Date.UTC(2026, 0, index + 1)),
      open: index === 13 ? 200 : 100,
      high: index === 13 ? 201 : 101,
      low: index === 13 ? 199 : 99,
      close: index === 13 ? 200 : 100,
      volume: 1_000n,
      amount: index === 13 ? 200_000 : 100_000,
    }));
    versionRepository.findOne.mockResolvedValue({
      id: 7,
      strategyDefinitionId: 1,
      entryRule: {
        field: 'indicator.ma13',
        operator: 'crossesAbove',
        value: 105,
      },
      exitRule: null,
      lookbackBars: 12,
    });
    kRepository.findOne.mockResolvedValue(history[13]);
    kRepository.find.mockResolvedValue([...history].reverse());

    const result = await service.runScan({});

    expect(kRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 14 }),
    );
    expect(result).toMatchObject({
      createdSignals: 1,
      createdAlertEvents: 1,
    });
    expect(signalRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        signalKind: StrategySignalKind.ENTRY,
        signalTime: history[13].timestamp,
      }),
    );
  });
});
