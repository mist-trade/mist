import { BacktestRun, BacktestRunStatus, Period } from '@app/shared-data';
import { DEFAULT_BROKER_INITIAL_CASH } from '@app/strategy';
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

    it('preserves non-empty masterRun.targetUniverse over scenario.recommendedUniverse and falls back only when empty', async () => {
      const explicitRun: BacktestRun = {
        id: 21,
        strategyDefinitionId: 1,
        strategyVersionId: 1,
        strategyDefinition: {} as any,
        strategyVersion: {} as any,
        tradeCount: 0,
        targetUniverse: ['600519.SH', '000858.SZ'],
        targetIssues: [],
        period: Period.DAY,
        source: 'tdx' as any,
        startDate: new Date('2015-01-01T00:00:00.000Z'),
        endDate: new Date('2024-12-31T00:00:00.000Z'),
        status: BacktestRunStatus.RUNNING,
        kind: 'rule_dsl' as any,
        signalCount: 0,
        matchedSecurityCount: 0,
        suiteId: 'suite-stress-21',
        scenarioId: 'STRESS_SUITE',
        stage: 'MASTER',
        contextSnapshot: {
          stressOptions: {
            scenarios: ['CRASH_2015'],
          },
        },
        tradeResults: [],
        signalResults: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const capturedUniverses: string[][] = [];
      await suiteExecutor.executeStressSuite(
        explicitRun,
        async (childRunId) => {
          const child = await runRepo.findOne({ where: { id: childRunId } });
          if (child) {
            capturedUniverses.push([...child.targetUniverse]);
            child.status = BacktestRunStatus.COMPLETED;
            child.navSeries = [
              {
                date: '2015-06-15',
                totalEquity: 2 * DEFAULT_BROKER_INITIAL_CASH,
              },
              {
                date: '2015-06-16',
                totalEquity: 2 * DEFAULT_BROKER_INITIAL_CASH,
              },
            ];
            await runRepo.save(child);
          }
        },
      );

      expect(capturedUniverses).toEqual([['600519.SH', '000858.SZ']]);

      // Empty targetUniverse falls back to scenario.recommendedUniverse
      const emptyUniverseRun: BacktestRun = {
        ...explicitRun,
        id: 22,
        suiteId: 'suite-stress-22',
        targetUniverse: [],
      };
      const fallbackUniverses: string[][] = [];
      const fallbackReport = await suiteExecutor.executeStressSuite(
        emptyUniverseRun,
        async (childRunId) => {
          const child = await runRepo.findOne({ where: { id: childRunId } });
          if (child) {
            fallbackUniverses.push([...child.targetUniverse]);
            child.status = BacktestRunStatus.COMPLETED;
            const n = child.targetUniverse.length;
            child.navSeries = [
              {
                date: '2015-06-15',
                totalEquity: n * DEFAULT_BROKER_INITIAL_CASH,
              },
              {
                date: '2015-06-16',
                totalEquity: n * DEFAULT_BROKER_INITIAL_CASH,
              },
            ];
            await runRepo.save(child);
          }
        },
      );

      expect(fallbackUniverses).toEqual([['000300', '000001', '399006']]);
      expect(fallbackReport.scenarioOutcomes[0].metrics.totalReturn).toBe(0);
    });

    it('scales stress initialCash by effective target count so multi-security returns are uninflated and match 1-security baseline', async () => {
      const makeMaster = (
        id: number,
        targetUniverse: string[],
      ): BacktestRun => ({
        id,
        strategyDefinitionId: 1,
        strategyVersionId: 1,
        strategyDefinition: {} as any,
        strategyVersion: {} as any,
        tradeCount: 0,
        targetUniverse,
        targetIssues: [],
        period: Period.DAY,
        source: 'tdx' as any,
        startDate: new Date('2015-01-01T00:00:00.000Z'),
        endDate: new Date('2024-12-31T00:00:00.000Z'),
        status: BacktestRunStatus.RUNNING,
        kind: 'rule_dsl' as any,
        signalCount: 0,
        matchedSecurityCount: 0,
        suiteId: `suite-stress-${id}`,
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
      });

      const singleReport = await suiteExecutor.executeStressSuite(
        makeMaster(30, ['600000.SH']),
        async (childRunId) => {
          const child = await runRepo.findOne({ where: { id: childRunId } });
          if (child) {
            child.status = BacktestRunStatus.COMPLETED;
            child.navSeries = [
              { date: '2015-06-15', totalEquity: 1_000_000 },
              { date: '2015-06-16', totalEquity: 950_000 },
              { date: '2015-06-17', totalEquity: 900_000 },
            ];
            await runRepo.save(child);
          }
        },
      );

      // 3-target run where CRASH_2015 has all 3 effective (-10%) and CIRCUIT_2016 has 1 NO_HISTORICAL_BARS (only 2 effective, -10%)
      const multiReport = await suiteExecutor.executeStressSuite(
        makeMaster(31, ['600000.SH', '000001.SZ', '399006.SZ']),
        async (childRunId) => {
          const child = await runRepo.findOne({ where: { id: childRunId } });
          if (child) {
            child.status = BacktestRunStatus.COMPLETED;
            if (child.scenarioId === 'CIRCUIT_2016') {
              child.targetIssues = [
                { securityCode: '399006.SZ', code: 'NO_HISTORICAL_BARS' },
              ];
              child.navSeries = [
                { date: '2016-01-04', totalEquity: 2_000_000 },
                { date: '2016-01-05', totalEquity: 1_900_000 },
                { date: '2016-01-06', totalEquity: 1_800_000 },
              ];
            } else {
              child.navSeries = [
                { date: '2015-06-15', totalEquity: 3_000_000 },
                { date: '2015-06-16', totalEquity: 2_850_000 },
                { date: '2015-06-17', totalEquity: 2_700_000 },
              ];
            }
            await runRepo.save(child);
          }
        },
      );

      expect(multiReport.scenarioOutcomes[0].metrics.totalReturn).toBe(-0.1);
      expect(multiReport.scenarioOutcomes[1].metrics.totalReturn).toBe(-0.1);
      expect(multiReport.healthCard.averageTotalReturn).toBe(
        singleReport.healthCard.averageTotalReturn,
      );
      expect(multiReport.healthCard.worstCaseDrawdown).toBe(
        singleReport.healthCard.worstCaseDrawdown,
      );
      expect(multiReport.healthCard.averageSharpeRatio).toBe(
        singleReport.healthCard.averageSharpeRatio,
      );
    });
  });

  describe('executeWfaSuite multi-security capital scaling', () => {
    it('scales WFA initialCapital by unique targetUniverse count so stitchedNavSeries matches child capital dimension and 1-vs-N OOS metrics agree', async () => {
      const makeWfaMaster = (
        id: number,
        targetUniverse: string[],
      ): BacktestRun => ({
        id,
        strategyDefinitionId: 1,
        strategyVersionId: 1,
        strategyDefinition: {} as any,
        strategyVersion: {} as any,
        tradeCount: 0,
        targetUniverse,
        targetIssues: [],
        period: Period.DAY,
        source: 'tdx' as any,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2021-07-01T00:00:00.000Z'),
        status: BacktestRunStatus.RUNNING,
        kind: 'rule_dsl' as any,
        signalCount: 0,
        matchedSecurityCount: 0,
        suiteId: `suite-wfa-${id}`,
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
      });

      const singleReport = await suiteExecutor.executeWfaSuite(
        makeWfaMaster(40, ['600000.SH']),
        async (childRunId) => {
          const child = await runRepo.findOne({ where: { id: childRunId } });
          if (child) {
            child.status = BacktestRunStatus.COMPLETED;
            child.sharpeRatio = child.stage === 'TRAIN' ? 1.5 : 1.2;
            child.navSeries =
              child.scenarioId === 'FOLD_0_TEST'
                ? [
                    { date: '2021-01-04', totalEquity: 1_000_000 },
                    { date: '2021-01-05', totalEquity: 1_050_000 },
                  ]
                : [
                    { date: '2021-04-01', totalEquity: 1_000_000 },
                    { date: '2021-04-02', totalEquity: 1_020_000 },
                  ];
            await runRepo.save(child);
          }
        },
      );

      // Duplicate/whitespace entry should deduplicate to 3 effective targets
      const multiReport = await suiteExecutor.executeWfaSuite(
        makeWfaMaster(41, [
          '600000.SH',
          ' 600000.SH ',
          '000001.SZ',
          '399006.SZ',
        ]),
        async (childRunId) => {
          const child = await runRepo.findOne({ where: { id: childRunId } });
          if (child) {
            child.status = BacktestRunStatus.COMPLETED;
            child.sharpeRatio = child.stage === 'TRAIN' ? 1.5 : 1.2;
            child.navSeries =
              child.scenarioId === 'FOLD_0_TEST'
                ? [
                    { date: '2021-01-04', totalEquity: 3_000_000 },
                    { date: '2021-01-05', totalEquity: 3_150_000 },
                  ]
                : [
                    { date: '2021-04-01', totalEquity: 3_000_000 },
                    { date: '2021-04-02', totalEquity: 3_060_000 },
                  ];
            await runRepo.save(child);
          }
        },
      );

      expect(singleReport.stitchedNavSeries[0].totalEquity).toBe(
        DEFAULT_BROKER_INITIAL_CASH,
      );
      expect(multiReport.stitchedNavSeries[0].totalEquity).toBe(
        3 * DEFAULT_BROKER_INITIAL_CASH,
      );
      expect(multiReport.stitchedNavSeries.at(-1)?.totalEquity).toBe(
        3 * (singleReport.stitchedNavSeries.at(-1)?.totalEquity ?? 0),
      );
      expect(multiReport.overallOosMetrics.totalReturn).toBe(
        singleReport.overallOosMetrics.totalReturn,
      );
      expect(multiReport.overallOosMetrics.sharpeRatio).toBe(
        singleReport.overallOosMetrics.sharpeRatio,
      );
    });
  });
});
