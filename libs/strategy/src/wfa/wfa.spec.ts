import {
  sliceWfaWindows,
  stitchWfaNavSeries,
  computeParameterStabilityIndex,
  WalkForwardOrchestrator,
  type WfaSliceOptions,
  type WfaNavPoint,
  type WfaFoldDefinition,
} from './index';

describe('Walk-Forward Analysis (WFA) Pure Domain Core', () => {
  describe('1. WfaWindowSlicer (Rolling & Anchored Window Slicing)', () => {
    it('slices rolling windows with strict monotonicity and zero lookahead bias', () => {
      const options: WfaSliceOptions = {
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: '2022-01-01T00:00:00.000Z',
        windowType: 'rolling',
        trainDurationMonths: 12,
        testDurationMonths: 3,
        stepDurationMonths: 3,
      };

      const folds = sliceWfaWindows(options);

      // Total span = 24 months.
      // Fold 0: Train 2020-01-01 to 2021-01-01 (12m), Test 2021-01-01 to 2021-04-01 (3m)
      // Fold 1: Train 2020-04-01 to 2021-04-01 (12m), Test 2021-04-01 to 2021-07-01 (3m)
      // Fold 2: Train 2020-07-01 to 2021-07-01 (12m), Test 2021-07-01 to 2021-10-01 (3m)
      // Fold 3: Train 2020-10-01 to 2021-10-01 (12m), Test 2021-10-01 to 2022-01-01 (3m)
      expect(folds.length).toBe(4);

      for (let i = 0; i < folds.length; i++) {
        const fold = folds[i];
        expect(fold.foldIndex).toBe(i);
        const trainStart = new Date(fold.trainStartDate).getTime();
        const trainEnd = new Date(fold.trainEndDate).getTime();
        const testStart = new Date(fold.testStartDate).getTime();
        const testEnd = new Date(fold.testEndDate).getTime();

        // Monotonicity and causality assertions:
        expect(trainStart).toBeLessThan(trainEnd);
        expect(trainEnd).toBe(testStart); // zero gap, zero overlap
        expect(testStart).toBeLessThan(testEnd);
        expect(testEnd).toBeLessThanOrEqual(
          new Date('2022-01-01T00:00:00.000Z').getTime(),
        );

        if (i > 0) {
          const prevFold = folds[i - 1];
          // Rolling advances trainStart forward by stepDurationMonths
          expect(new Date(fold.trainStartDate).getTime()).toBeGreaterThan(
            new Date(prevFold.trainStartDate).getTime(),
          );
        }
      }

      expect(folds[0].trainStartDate).toBe('2020-01-01T00:00:00.000Z');
      expect(folds[0].trainEndDate).toBe('2021-01-01T00:00:00.000Z');
      expect(folds[0].testStartDate).toBe('2021-01-01T00:00:00.000Z');
      expect(folds[0].testEndDate).toBe('2021-04-01T00:00:00.000Z');

      expect(folds[3].testEndDate).toBe('2022-01-01T00:00:00.000Z');
    });

    it('slices anchored windows expanding training window while keeping start date anchored', () => {
      const options: WfaSliceOptions = {
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: '2021-07-01T00:00:00.000Z',
        windowType: 'anchored',
        trainDurationMonths: 12,
        testDurationMonths: 3,
        stepDurationMonths: 3,
      };

      const folds = sliceWfaWindows(options);

      // Fold 0: Train 2020-01-01 to 2021-01-01 (12m), Test 2021-01-01 to 2021-04-01 (3m)
      // Fold 1: Train 2020-01-01 to 2021-04-01 (15m anchored!), Test 2021-04-01 to 2021-07-01 (3m)
      expect(folds.length).toBe(2);

      // All folds have identical anchored trainStartDate
      expect(folds[0].trainStartDate).toBe('2020-01-01T00:00:00.000Z');
      expect(folds[1].trainStartDate).toBe('2020-01-01T00:00:00.000Z');

      expect(folds[0].trainEndDate).toBe('2021-01-01T00:00:00.000Z');
      expect(folds[1].trainEndDate).toBe('2021-04-01T00:00:00.000Z');

      expect(folds[0].testStartDate).toBe('2021-01-01T00:00:00.000Z');
      expect(folds[0].testEndDate).toBe('2021-04-01T00:00:00.000Z');

      expect(folds[1].testStartDate).toBe('2021-04-01T00:00:00.000Z');
      expect(folds[1].testEndDate).toBe('2021-07-01T00:00:00.000Z');
    });

    it('returns empty array when total duration is shorter than train + test duration', () => {
      const options: WfaSliceOptions = {
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: '2020-06-01T00:00:00.000Z', // 5 months only
        windowType: 'rolling',
        trainDurationMonths: 12,
        testDurationMonths: 3,
      };

      const folds = sliceWfaWindows(options);
      expect(folds).toEqual([]);
    });

    it('throws error when startDate >= endDate or durations are non-positive', () => {
      expect(() =>
        sliceWfaWindows({
          startDate: '2021-01-01',
          endDate: '2020-01-01',
          windowType: 'rolling',
        }),
      ).toThrow();

      expect(() =>
        sliceWfaWindows({
          startDate: '2020-01-01',
          endDate: '2022-01-01',
          windowType: 'rolling',
          trainDurationMonths: 0,
        }),
      ).toThrow();
    });
  });

  describe('2. WfaStitcher (Compounded OOS NAV Stitching & PSI)', () => {
    it('seamlessly stitches disjoint OOS NAV points into a continuous forward equity curve', () => {
      // Fold 0 test series (returns: +5%, then +5%)
      const fold0Nav: WfaNavPoint[] = [
        {
          date: '2021-01-04',
          totalEquity: 100000,
          cash: 100000,
          marketValue: 0,
        },
        {
          date: '2021-01-05',
          totalEquity: 105000,
          cash: 50000,
          marketValue: 55000,
        },
        {
          date: '2021-01-06',
          totalEquity: 110250,
          cash: 50000,
          marketValue: 60250,
        },
      ];

      // Fold 1 test series (returns: +2%, then +2%)
      const fold1Nav: WfaNavPoint[] = [
        {
          date: '2021-01-06',
          totalEquity: 100000,
          cash: 100000,
          marketValue: 0,
        }, // boundary overlap point
        {
          date: '2021-01-07',
          totalEquity: 102000,
          cash: 50000,
          marketValue: 52000,
        },
        {
          date: '2021-01-08',
          totalEquity: 104040,
          cash: 50000,
          marketValue: 54040,
        },
      ];

      const stitched = stitchWfaNavSeries(
        [{ testNavSeries: fold0Nav }, { testNavSeries: fold1Nav }],
        100000,
      );

      // Stitched curve length should be 5 unique dates
      expect(stitched.length).toBe(5);
      expect(stitched.map((p) => p.date)).toEqual([
        '2021-01-04',
        '2021-01-05',
        '2021-01-06',
        '2021-01-07',
        '2021-01-08',
      ]);

      // Day 1: 100,000
      expect(stitched[0].totalEquity).toBe(100000);
      // Day 2: 105,000 (+5%)
      expect(stitched[1].totalEquity).toBe(105000);
      // Day 3: 110,250 (+5%)
      expect(stitched[2].totalEquity).toBe(110250);
      // Day 4: 110,250 * 1.02 = 112,455 (+2% forward compounded from fold 1!)
      expect(stitched[3].totalEquity).toBe(112455);
      // Day 5: 112,455 * 1.02 = 114,704.10 (+2%)
      expect(stitched[4].totalEquity).toBe(114704.1);

      // Assert cash and market value proportional allocation
      expect(stitched[3].cash).toBe(
        Math.round(112455 * (50000 / 102000) * 100) / 100,
      );
      expect(stitched[3].marketValue).toBe(
        Math.round((112455 - stitched[3].cash!) * 100) / 100,
      );
    });

    it('handles empty folds and empty nav series gracefully', () => {
      expect(stitchWfaNavSeries([])).toEqual([]);
      expect(stitchWfaNavSeries([{ testNavSeries: [] }])).toEqual([]);
    });

    it('computes Parameter Stability Index (PSI) accurately', () => {
      // Case 1: Perfectly identical positive Sharpe ratios -> CV = 0, PSI = 1.0
      const stableFolds = [
        { trainSharpe: 1.5, testSharpe: 1.2 },
        { trainSharpe: 1.6, testSharpe: 1.2 },
        { trainSharpe: 1.4, testSharpe: 1.2 },
      ];
      expect(computeParameterStabilityIndex(stableFolds)).toBe(1.0);

      // Case 2: Highly dispersed test Sharpe ratios -> lower PSI
      const volatileFolds = [
        { trainSharpe: 2.0, testSharpe: 3.0 },
        { trainSharpe: 2.0, testSharpe: 0.1 },
        { trainSharpe: 2.0, testSharpe: 1.5 },
      ];
      const psi = computeParameterStabilityIndex(volatileFolds);
      expect(psi).toBeGreaterThan(0);
      expect(psi).toBeLessThan(0.7);

      // Case 3: Negative or zero mean test Sharpe -> 0.0
      const negativeFolds = [
        { trainSharpe: 1.5, testSharpe: -0.5 },
        { trainSharpe: 1.5, testSharpe: -0.8 },
      ];
      expect(computeParameterStabilityIndex(negativeFolds)).toBe(0);

      // Case 4: Empty folds -> 0
      expect(computeParameterStabilityIndex([])).toBe(0);
    });
  });

  describe('3. WalkForwardOrchestrator (Pipeline Coordination)', () => {
    it('coordinates full WFA pipeline, calculating overfitting ratio, stitched curve and report', async () => {
      const orchestrator = new WalkForwardOrchestrator();

      const runnerCalls: WfaFoldDefinition[] = [];
      const report = await orchestrator.execute({
        suiteId: 'test-wfa-suite-001',
        initialCapital: 100000,
        sliceOptions: {
          startDate: '2020-01-01T00:00:00.000Z',
          endDate: '2021-07-01T00:00:00.000Z',
          windowType: 'rolling',
          trainDurationMonths: 12,
          testDurationMonths: 3,
          stepDurationMonths: 3,
        },
        runner: async (fold) => {
          runnerCalls.push(fold);
          const isFold0 = fold.foldIndex === 0;
          return {
            trainRunId: 101 + fold.foldIndex * 2,
            testRunId: 102 + fold.foldIndex * 2,
            trainSharpe: 1.5,
            testSharpe: isFold0 ? 1.2 : 0.9,
            testTrades: [
              {
                realizedPnl: isFold0 ? 5000 : 2000,
                returnRatio: isFold0 ? 0.05 : 0.02,
              },
            ],
            testNavSeries: isFold0
              ? [
                  { date: '2021-01-04', totalEquity: 100000 },
                  { date: '2021-01-05', totalEquity: 105000 },
                ]
              : [
                  { date: '2021-04-01', totalEquity: 100000 },
                  { date: '2021-04-02', totalEquity: 102000 },
                ],
          };
        },
      });

      expect(runnerCalls.length).toBe(2);
      expect(report.suiteId).toBe('test-wfa-suite-001');
      expect(report.totalFolds).toBe(2);
      expect(report.windowType).toBe('rolling');

      // Check fold 0 results: overfitting ratio = 1.2 / 1.5 = 0.8
      expect(report.folds[0].overfittingRatio).toBe(0.8);
      // Check fold 1 results: overfitting ratio = 0.9 / 1.5 = 0.6
      expect(report.folds[1].overfittingRatio).toBe(0.6);

      // Mean overfitting ratio = (0.8 + 0.6) / 2 = 0.7
      expect(report.meanOverfittingRatio).toBe(0.7);

      // Parameter stability index should be positive and valid
      expect(report.parameterStabilityIndex).toBeGreaterThan(0);
      expect(report.parameterStabilityIndex).toBeLessThanOrEqual(1.0);

      // Stitched curve length
      expect(report.stitchedNavSeries.length).toBeGreaterThan(0);

      // Overall OOS performance metrics populated from @app/indicators
      expect(report.overallOosMetrics).toBeDefined();
      expect(report.overallOosMetrics.tradeCount).toBe(2);
      expect(report.overallOosMetrics.totalReturn).toBeGreaterThan(0);
    });
  });
});
