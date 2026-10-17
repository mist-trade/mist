import { formatShanghaiDateString } from '@app/timezone';
import {
  ExecutionRiskArbiter,
  MarketRiskRegime,
} from '../execution/execution-risk-arbiter';
import { SimulatedBroker } from '../execution/simulated-broker';
import { PositionStateMachine } from '../position/position-state-machine';
import {
  ORDER_SIDES,
  ORDER_STATUSES,
  ORDER_TYPES,
} from '../strategy.constants';
import {
  getPresetStressScenario,
  listPresetStressScenarios,
  PRESET_STRESS_SCENARIOS,
  STRESS_SCENARIO_IDS,
  type StressScenarioDefinition,
} from './stress-scenarios.constants';
import { StressTestingSuiteOrchestrator } from './stress-testing-suite.orchestrator';
import type { StressScenarioRunResult } from './stress-testing-suite.types';

describe('A 股五大历史极端事件压力测试套件 (Stress Testing Suite)', () => {
  describe('1. 五大历史压力场景注册表静态定义核验 (Static Constants & Boundaries)', () => {
    it('注册表必须包含五大经典历史黑天鹅场景且 ID 唯一', () => {
      const scenarios = listPresetStressScenarios();
      expect(scenarios).toHaveLength(5);

      const expectedIds = [
        STRESS_SCENARIO_IDS.CRASH_2015,
        STRESS_SCENARIO_IDS.CIRCUIT_2016,
        STRESS_SCENARIO_IDS.BEAR_2018,
        STRESS_SCENARIO_IDS.SQUEEZE_2024,
        STRESS_SCENARIO_IDS.PULSE_2024,
      ];

      for (const id of expectedIds) {
        expect(PRESET_STRESS_SCENARIOS[id]).toBeDefined();
        expect(PRESET_STRESS_SCENARIOS[id].id).toBe(id);
      }
    });

    it('所有预设场景必须满足时序因果律与数据防毒门禁 (startDate >= 1996-12-16 且 startDate < endDate)', () => {
      const minDate = new Date('1996-12-16T00:00:00.000Z').getTime();

      for (const scenario of listPresetStressScenarios()) {
        const startMs = new Date(scenario.startDate).getTime();
        const endMs = new Date(scenario.endDate).getTime();

        // 契约断言 1: 起始时间早于结束时间
        expect(startMs).toBeLessThan(endMs);

        // 契约断言 2: 必须在 1996-12-16 涨跌停建立之后（DataSanitizationGuard 合规）
        expect(startMs).toBeGreaterThanOrEqual(minDate);

        // 契约断言 3: 元数据完整性
        expect(scenario.name).toBeTruthy();
        expect(scenario.description).toBeTruthy();
        expect(scenario.recommendedUniverse.length).toBeGreaterThan(0);
        expect(scenario.keyRisks.length).toBeGreaterThan(0);
        expect(scenario.regime).toBeDefined();
      }
    });

    it('常用辅助查找函数必须准确工作', () => {
      const crash = getPresetStressScenario('CRASH_2015');
      expect(crash).toBeDefined();
      expect(crash?.name).toContain('2015');

      const nonExistent = getPresetStressScenario('NON_EXISTENT_SCENARIO');
      expect(nonExistent).toBeUndefined();
    });
  });

  describe('2. 压力测试套件编排器执行与体检报告聚合 (Execution & Health Card Aggregation)', () => {
    const orchestrator = new StressTestingSuiteOrchestrator();

    it('调度五大预设场景，准确计算综合风险指标与体检报告 (Health Card)', async () => {
      const mockRunner = async (
        scenario: StressScenarioDefinition,
      ): Promise<StressScenarioRunResult> => {
        if (scenario.id === 'CRASH_2015') {
          // 模拟杠杆断崖暴跌：净值从 100 万跌至 72 万 (回撤 28%)，并发生跌停顺延罚款
          return {
            navSeries: [
              1000000, 950000, 900000, 850000, 800000, 750000, 720000, 740000,
            ],
            trades: [
              {
                isBlockedDelayed: true,
                slippageLoss: 12500,
                realizedPnl: -280000,
                returnRatio: -0.28,
              },
            ],
            initialCash: 1000000,
          };
        } else if (scenario.id === 'CIRCUIT_2016') {
          // 模拟熔断断层闪崩：短时剧烈震荡跳空
          return {
            navSeries: [1000000, 930000, 900000, 920000],
            trades: [
              {
                realizedPnl: -80000,
                returnRatio: -0.08,
              },
            ],
            initialCash: 1000000,
          };
        } else if (scenario.id === 'BEAR_2018') {
          // 模拟长周期单边阴跌：长时间处于回撤水下 (连续 60 交易日低于峰值)
          const navSeries = [1000000];
          for (let i = 0; i < 60; i++) {
            navSeries.push(950000 - i * 1000);
          }
          return {
            navSeries,
            trades: [
              {
                realizedPnl: -50000,
                returnRatio: -0.05,
              },
            ],
            initialCash: 1000000,
          };
        } else if (scenario.id === 'SQUEEZE_2024') {
          // 模拟微盘踩踏雪球敲入：快速下跌后平仓
          return {
            navSeries: [1000000, 960000, 920000, 880000, 890000],
            trades: [
              {
                realizedPnl: -110000,
                returnRatio: -0.11,
              },
            ],
            initialCash: 1000000,
          };
        } else {
          // PULSE_2024: 冲高后高开低走回落
          return {
            navSeries: [1000000, 1080000, 1150000, 1100000, 1040000],
            trades: [
              {
                realizedPnl: 40000,
                returnRatio: 0.04,
              },
            ],
            initialCash: 1000000,
          };
        }
      };

      const report = await orchestrator.execute({
        runner: mockRunner,
      });

      // 1. 场景总览断言
      expect(report.totalScenarios).toBe(5);
      expect(report.passedScenarios).toBe(5);
      expect(report.criticalScenarios).toBeGreaterThanOrEqual(1);
      expect(report.scenarioOutcomes).toHaveLength(5);
      expect(Date.parse(report.generatedAt)).not.toBeNaN();

      // 2. 体检报告核心聚合指标断言 (Health Card)
      const { healthCard } = report;
      expect(healthCard.worstCaseDrawdown).toBeCloseTo(0.28, 2);
      expect(healthCard.worstCaseScenarioId).toBe('CRASH_2015');
      expect(healthCard.maxUnderwaterDuration).toBeGreaterThanOrEqual(60);
      expect(healthCard.totalLiquidityPenalty).toBe(12500);
      expect(healthCard.hasBankruptcy).toBe(false);
      expect(healthCard.worstDailyReturn).toBeLessThan(-0.05);

      // 3. 评分与改进建议断言
      expect(healthCard.overallHealthScore).toBeGreaterThanOrEqual(0);
      expect(healthCard.overallHealthScore).toBeLessThanOrEqual(100);
      expect(healthCard.overallRating).toBeDefined();
      expect(healthCard.keyRecommendations.length).toBeGreaterThan(0);

      // 包含了回撤与潜伏期针对性建议
      const allRecs = healthCard.keyRecommendations.join(';');
      expect(allRecs).toContain('最坏回撤');
      expect(allRecs).toContain('最大回撤潜伏期');
      expect(allRecs).toContain('跌停流动性冻结');
    });

    it('支持指定场景子集（按 ID 列表或自定义定义）', async () => {
      const runner = jest.fn().mockResolvedValue({
        navSeries: [1000000, 1020000, 1010000],
        trades: [],
        initialCash: 1000000,
      });

      // 1. 按 ID 字符串数组执行子集
      const reportSubset = await orchestrator.run({
        scenarios: ['CIRCUIT_2016', 'PULSE_2024'],
        runner,
      });
      expect(reportSubset.totalScenarios).toBe(2);
      expect(reportSubset.scenarioOutcomes[0].scenario.id).toBe('CIRCUIT_2016');
      expect(reportSubset.scenarioOutcomes[1].scenario.id).toBe('PULSE_2024');

      // 2. 自定义压力场景传入
      const customScenario: StressScenarioDefinition = {
        id: 'CUSTOM_SHOCK_2020',
        name: '2020 疫情全球流动性闪崩',
        regime: MarketRiskRegime.SYSTEMIC_CRUNCH,
        startDate: '2020-02-03T00:00:00.000Z',
        endDate: '2020-03-23T00:00:00.000Z',
        description: '春节后开盘千股跌停及海外市场连续熔断。',
        recommendedUniverse: ['000300'],
        keyRisks: ['开盘跌停跳空'],
      };

      const reportCustom = await orchestrator.run({
        scenarios: [customScenario],
        runner,
      });
      expect(reportCustom.totalScenarios).toBe(1);
      expect(reportCustom.scenarioOutcomes[0].scenario.id).toBe(
        'CUSTOM_SHOCK_2020',
      );

      // 3. 传入未知场景 ID 必须抛出明确异常
      await expect(
        orchestrator.run({
          scenarios: ['INVALID_SCENARIO_ID'],
          runner,
        }),
      ).rejects.toThrow('Unknown stress scenario id: INVALID_SCENARIO_ID');
    });
  });

  describe('3. 异常处理与极端边界防御 (Error Handling & Edge Cases)', () => {
    const orchestrator = new StressTestingSuiteOrchestrator();

    it('当 failFast 为 false 时，单个场景执行失败应记录错误并继续后续场景', async () => {
      const runner = async (scenario: StressScenarioDefinition) => {
        if (scenario.id === 'CIRCUIT_2016') {
          throw new Error('Data connection timeout in 2016');
        }
        return {
          navSeries: [1000000, 1010000],
          trades: [],
        };
      };

      const report = await orchestrator.execute({
        scenarios: ['CRASH_2015', 'CIRCUIT_2016', 'PULSE_2024'],
        runner,
        failFast: false,
      });

      expect(report.totalScenarios).toBe(3);
      expect(report.passedScenarios).toBe(2);
      expect(report.criticalScenarios).toBe(1);

      const failedOutcome = report.scenarioOutcomes.find(
        (o) => o.scenario.id === 'CIRCUIT_2016',
      );
      expect(failedOutcome).toBeDefined();
      expect(failedOutcome?.success).toBe(false);
      expect(failedOutcome?.error).toContain('Data connection timeout in 2016');
      expect(failedOutcome?.survivalAssessment.riskGrade).toBe('FAILED');
    });

    it('当 failFast 为 true 时，场景执行失败立即向上抛出异常', async () => {
      const runner = async () => {
        throw new Error('Fatal engine crash');
      };

      await expect(
        orchestrator.execute({
          scenarios: ['CRASH_2015'],
          runner,
          failFast: true,
        }),
      ).rejects.toThrow('Fatal engine crash');
    });

    it('穿仓破产场景检测：净值降至 0 或以下触发破产判定与 0 分惩罚', async () => {
      const runner = async () => ({
        navSeries: [1000000, 500000, 0], // 穿仓归零
        trades: [
          {
            realizedPnl: -1000000,
            returnRatio: -1.0,
          },
        ],
      });

      const report = await orchestrator.execute({
        scenarios: ['CRASH_2015'],
        runner,
      });

      expect(report.healthCard.hasBankruptcy).toBe(true);
      expect(report.healthCard.overallHealthScore).toBe(0);
      expect(report.healthCard.overallRating).toBe('FAIL');
      expect(report.healthCard.keyRecommendations[0]).toContain('穿仓破产');
    });

    it('极短或空净值时序边界测试：防除零与防崩溃', async () => {
      const runner = async () => ({
        navSeries: [1000000], // 仅 1 个净值点
        trades: [],
      });

      const report = await orchestrator.execute({
        scenarios: ['CIRCUIT_2016'],
        runner,
      });

      expect(report.scenarioOutcomes[0].metrics.maxDrawdown).toBe(0);
      expect(report.scenarioOutcomes[0].metrics.sharpeRatio).toBe(0);
      expect(report.healthCard.worstDailyReturn).toBe(0);
    });
  });

  describe('4. 统一裁决器、经纪商与套件端到端闭环测试 (Arbiter & Broker End-to-End Synergy)', () => {
    it('模拟跌停流动性冻结与顺延，验证套件能真实捕获 Liquidity Delay Penalty', async () => {
      const orchestrator = new StressTestingSuiteOrchestrator();

      // 在场景运行器中运行包含 ExecutionRiskArbiter 与 SimulatedBroker 的微观撮合时序
      const runner = async (): Promise<StressScenarioRunResult> => {
        const broker = new SimulatedBroker({
          initialCash: 1000000,
          slippageRatio: 0.002, // 0.2% 滑点
        });
        const position = new PositionStateMachine(1, '000001', 1000000);
        const arbiter = new ExecutionRiskArbiter({
          hardStopLossRatio: -0.05, // 浮亏 5% 止损
        });

        const day1 = new Date('2015-06-15T09:30:00.000Z');
        const day2 = new Date('2015-06-16T09:30:00.000Z');
        const day3 = new Date('2015-06-17T09:30:00.000Z');
        const day4 = new Date('2015-06-18T09:30:00.000Z');

        // Day 1: 买入开仓 10000 股，均价 10 元
        const buyOrder = broker.submitOrder({
          securityId: 1,
          securityCode: '000001',
          side: ORDER_SIDES.BUY,
          orderType: ORDER_TYPES.MARKET,
          quantity: 10000,
          signalTime: new Date(day1.getTime() - 60000),
        });
        expect(buyOrder.status).toBe(ORDER_STATUSES.PENDING);

        const bar1 = {
          securityId: 1,
          securityCode: '000001',
          source: 'tdx' as const,
          period: 101,
          timestamp: day1,
          open: 10.0,
          high: 10.5,
          low: 9.9,
          close: 10.0,
          volume: '10000',
          amount: '100000',
          type: 'complete' as const,
        };
        const fills1 = broker.onBar(bar1);
        expect(fills1).toHaveLength(1);
        position.onOrderFilled(fills1[0]);
        broker.settleDayClose(formatShanghaiDateString(day1));
        position.onDayClose(bar1);

        // Day 2: 股价下行至 9.20 元 (浮亏 -8%)，裁决器触发硬止损下达卖单
        const bar2 = {
          securityId: 1,
          securityCode: '000001',
          source: 'tdx' as const,
          period: 101,
          timestamp: day2,
          open: 9.5,
          high: 9.6,
          low: 9.15,
          close: 9.2,
          volume: '5000',
          amount: '46000',
          type: 'complete' as const,
        };
        broker.onBar(bar2);

        const sellDto = arbiter.arbitrate({
          bar: bar2,
          position: position.getSnapshot(),
          availableCash: broker.getAccount().availableCash,
        });
        expect(sellDto).not.toBeNull();
        expect(sellDto?.side).toBe(ORDER_SIDES.SELL);

        const sellOrder = broker.submitOrder(sellDto!);
        expect(sellOrder.status).toBe(ORDER_STATUSES.PENDING);
        broker.settleDayClose(formatShanghaiDateString(day2));
        position.onDayClose(bar2);

        // Day 3: 次日突发一字跌停暴跌至 8.28 元 (-10%)
        // Next-Bar 撮合：由于是一字跌停，卖单被挂起为 BLOCKED，禁止成交！
        const bar3 = {
          securityId: 1,
          securityCode: '000001',
          source: 'tdx' as const,
          period: 101,
          timestamp: day3,
          open: 8.28,
          high: 8.28,
          low: 8.28,
          close: 8.28,
          volume: '500',
          amount: '4140',
          type: 'complete' as const,
        };
        const fills2 = broker.onBar(bar3);
        expect(fills2).toHaveLength(0);
        const openOrders = broker.getOpenOrders();
        expect(openOrders[0].status).toBe(ORDER_STATUSES.BLOCKED);
        broker.settleDayClose(formatShanghaiDateString(day3));
        position.onDayClose(bar3);

        // Day 4: 跌停板打开，以 7.80 元成交出清，产生顺延额外滑点亏损
        const bar4 = {
          securityId: 1,
          securityCode: '000001',
          source: 'tdx' as const,
          period: 101,
          timestamp: day4,
          open: 7.8,
          high: 8.0,
          low: 7.7,
          close: 7.9,
          volume: '20000',
          amount: '156000',
          type: 'complete' as const,
        };

        const fills3 = broker.onBar(bar4);
        expect(fills3).toHaveLength(1);
        position.onOrderFilled(fills3[0]);
        broker.settleDayClose(formatShanghaiDateString(day4));
        position.onDayClose(bar4);

        const navSeries = position.getNavHistory().map((n) => n.totalEquity);
        // 将包含延迟标记的已平仓交易注入 ClosedTradeInput
        const trades = position.getClosedTrades().map((t) => ({
          ...t,
          isBlockedDelayed: true,
          slippageLoss: (8.28 - t.exitPrice) * t.quantity, // 顺延导致的额外损失
        }));

        return {
          navSeries,
          trades,
          initialCash: 1000000,
        };
      };

      const report = await orchestrator.execute({
        scenarios: ['CRASH_2015'],
        runner,
      });

      expect(report.totalScenarios).toBe(1);
      expect(
        report.scenarioOutcomes[0].survivalAssessment.liquidityPenaltyLoss,
      ).toBeGreaterThan(0);
      expect(report.healthCard.totalLiquidityPenalty).toBeGreaterThan(0);
      expect(report.healthCard.keyRecommendations.join(';')).toContain(
        '跌停流动性冻结',
      );
    });
  });
});
