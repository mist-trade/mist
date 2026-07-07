import {
  DataSource,
  Period,
  StrategyAlertStatus,
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
    };
    const version = {
      id: 7,
      strategyDefinitionId: 1,
      rule: { field: 'k.close', operator: 'gt', value: 100 },
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
    const service = new StrategyScanService(
      definitionRepository as any,
      versionRepository as any,
      kRepository as any,
      signalRepository as any,
      alertEventRepository as any,
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
      }),
    );
    expect(alertEventRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        strategySignalId: 2,
        status: StrategyAlertStatus.PENDING,
        dedupeKey: '1:7:600519:1440:tdx:2026-07-07T09:30:00.000Z',
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
});
