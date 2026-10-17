import { BacktestRun, BacktestRunStatus, Period } from '@app/shared-data';
import { BacktestSuiteExecutor } from './backtest-suite.executor';

describe('BacktestSuiteExecutor', () => {
  let runRepo: any;
  let tradeRepo: any;
  let suiteExecutor: BacktestSuiteExecutor;

  beforeEach(() => {
    const runsMap = new Map<number, BacktestRun>();
    let nextId = 1000;

    runRepo = {
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (run: any) => {
        if (!run.id) {
          run.id = nextId++;
        }
        runsMap.set(run.id, { ...run });
        return { ...run };
      }),
      findOne: jest.fn(async ({ where }: any) => {
        const found = runsMap.get(where.id);
        return found ? { ...found } : null;
      }),
      update: jest.fn(async ({ id }: any, updateData: any) => {
        const existing = runsMap.get(id);
        if (existing) {
          Object.assign(existing, updateData);
          runsMap.set(id, existing);
          return { affected: 1 };
        }
        return { affected: 0 };
      }),
    };

    tradeRepo = {
      find: jest.fn(async () => []),
    };

    suiteExecutor = new BacktestSuiteExecutor(runRepo, tradeRepo);
  });

  describe('executeWfaSuite', () => {
    it('schedules rolling WFA folds, creates child runs for train/test, and updates master run with stitched results', async () => {
      const masterRun: BacktestRun = {
        id: 10,
        strategyDefinitionId: 1,
        strategyVersionId: 1,
        strategyDefinition: {} as any,
        strategyVersion: {} as any,
        tradeCount: 0,
        targetUniverse: ['000300'],
        targetIssues: [],
        period: Period.DAY,
        source: 'tdx' as any,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2021-07-01T00:00:00.000Z'),
        status: BacktestRunStatus.RUNNING,
        kind: 'rule_dsl' as any,
        signalCount: 0,
        matchedSecurityCount: 0,
        suiteId: 'suite-wfa-10',
        scenarioId: 'WFA',
        stage: 'MASTER',
        contextSnapshot: {
          wfaOptions: {
            windowType: 'rolling',
            trainDurationMonths: 12,
            testDurationMonths: 3,
            stepDurationMonths: 3,
          },
        },
        tradeResults: [],
        signalResults: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const executedChildRunIds: number[] = [];
      const mockRunSingle = jest.fn(async (childRunId: number) => {
        executedChildRunIds.push(childRunId);
        const child = await runRepo.findOne({ where: { id: childRunId } });
        if (child) {
          child.status = BacktestRunStatus.COMPLETED;
          child.sharpeRatio = child.stage === 'TRAIN' ? 1.5 : 1.2;
          child.navSeries = [
            { date: '2021-01-04', totalEquity: 100000 },
            { date: '2021-01-05', totalEquity: 105000 },
          ];
          await runRepo.save(child);
        }
      });

      await suiteExecutor.executeWfaSuite(masterRun, mockRunSingle);

      // 2 folds * 2 runs (TRAIN + TEST) = 4 child runs
      expect(executedChildRunIds.length).toBe(4);

      // Master run should be updated to COMPLETED with stitched results and report
      expect(runRepo.update).toHaveBeenCalledWith(
        { id: 10 },
        expect.objectContaining({
          status: BacktestRunStatus.COMPLETED,
          navSeries: expect.any(Array),
          sharpeRatio: expect.any(Number),
          contextSnapshot: expect.objectContaining({
            wfaReport: expect.objectContaining({
              totalFolds: 2,
              windowType: 'rolling',
            }),
          }),
        }),
      );
    });
  });

  describe('executeStressSuite', () => {
    it('schedules preset stress scenarios, runs child runs, and generates health card report on master run', async () => {
      const masterRun: BacktestRun = {
        id: 20,
        strategyDefinitionId: 1,
        strategyVersionId: 1,
        strategyDefinition: {} as any,
        strategyVersion: {} as any,
        tradeCount: 0,
        targetUniverse: ['000300'],
        targetIssues: [],
        period: Period.DAY,
        source: 'tdx' as any,
        startDate: new Date('2015-01-01T00:00:00.000Z'),
        endDate: new Date('2024-12-31T00:00:00.000Z'),
        status: BacktestRunStatus.RUNNING,
        kind: 'rule_dsl' as any,
        signalCount: 0,
        matchedSecurityCount: 0,
        suiteId: 'suite-stress-20',
        scenarioId: 'STRESS_SUITE',
        stage: 'MASTER',
        contextSnapshot: {
          stressOptions: {
            scenarios: ['CRASH_2015', 'CIRCUIT_2016'],
          },
        },
        tradeResults: [],
        signalResults: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const executedChildRunIds: number[] = [];
      const mockRunSingle = jest.fn(async (childRunId: number) => {
        executedChildRunIds.push(childRunId);
        const child = await runRepo.findOne({ where: { id: childRunId } });
        if (child) {
          child.status = BacktestRunStatus.COMPLETED;
          child.maxDrawdown = -0.25;
          child.totalReturn = -0.15;
          child.sharpeRatio = 0.5;
          child.navSeries = [
            { date: '2015-06-15', totalEquity: 100000 },
            { date: '2015-06-16', totalEquity: 95000 },
            { date: '2015-06-17', totalEquity: 90000 },
          ];
          await runRepo.save(child);
        }
      });

      await suiteExecutor.executeStressSuite(masterRun, mockRunSingle);

      // 2 specified scenarios executed
      expect(executedChildRunIds.length).toBe(2);

      // Master run should be updated to COMPLETED with worst case drawdown and health card
      expect(runRepo.update).toHaveBeenCalledWith(
        { id: 20 },
        expect.objectContaining({
          status: BacktestRunStatus.COMPLETED,
          contextSnapshot: expect.objectContaining({
            stressReport: expect.objectContaining({
              totalScenarios: 2,
              healthCard: expect.any(Object),
            }),
          }),
        }),
      );
    });
  });
});
