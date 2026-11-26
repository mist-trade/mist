import type { ProjectedStrategyBar } from '@app/market-data';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { FactorContext } from '../factor/factor.types';
import { contextSeriesKey } from '../kernel/availability';
import { DecisionFlowEvaluator } from './decision-flow-evaluator';
import { extractPivotEvidence } from './decision-pivot-evidence';
import { renderTraceChainOf } from '../trading/manual';
import type { DecisionFlowNode } from './decision-flow.types';
import { DecisionExecutionTraceBuilder } from './decision-trace-builder';
import { LegacyStrategyCompiler } from './legacy-strategy-compiler';
import { LegacyRuleDslPlugin } from '../factor/plugins/legacy-rule-dsl.plugin';

function makeMockBar(
  time: Date,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 10000,
): ProjectedStrategyBar {
  return {
    rawBar: {
      securityId: 1,
      source: 'tdx',
      period: 5,
      timestamp: time,
      open,
      high,
      low,
      close,
      volume: String(volume),
      amount: String(volume * close),
      type: 'complete',
    },
    tradingDay: '2026-09-07',
    ohlc: {
      raw: { open, high, low, close },
      effective: { open, high, low, close },
      resolution: 'observed',
    },
    volume: {
      raw: String(volume),
      effective: String(volume),
      resolution: 'observed',
    },
    amount: {
      raw: String(volume * close),
      effective: String(volume * close),
      resolution: 'observed',
    },
  };
}

describe('Phase 2: Decision Flow Engine', () => {
  let registry: InMemoryFactorPluginRegistry;
  let evaluator: DecisionFlowEvaluator;

  beforeEach(() => {
    registry = new InMemoryFactorPluginRegistry();
    evaluator = new DecisionFlowEvaluator({ registry });
  });

  describe('GuardNode (Fast-Fail Short-Circuit)', () => {
    it('passes through onPass when requiredAction is satisfied', async () => {
      registry.register({
        id: 'plugin.guard.mock',
        name: 'Mock Guard',
        category: 'REGIME',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'BUY',
          reason: '大盘安全',
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_1',
        type: 'GUARD',
        name: '环境门禁',
        pluginId: 'plugin.guard.mock',
        requiredAction: 'BUY',
        onPass: {
          id: 'term_buy',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'SAFE_BUY',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.action).toBe('BUY');
      expect(result.signalTag).toBe('SAFE_BUY');
      expect(result.trace).toHaveLength(2);
      expect(result.trace[0].type).toBe('GUARD');
      expect(result.trace[1].type).toBe('TERMINAL');
    });

    it('aborts when guard action does not match requiredAction', async () => {
      registry.register({
        id: 'plugin.guard.mock',
        name: 'Mock Guard',
        category: 'REGIME',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'NEUTRAL',
          reason: '暂未看多',
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_1',
        type: 'GUARD',
        name: '环境门禁',
        pluginId: 'plugin.guard.mock',
        requiredAction: 'BUY',
        onPass: {
          id: 'term_buy',
          type: 'TERMINAL',
          action: 'BUY',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('ABORTED');
      expect(result.reason).toContain('前置门禁');
      expect(result.trace).toHaveLength(1);
    });

    it('passes and inherits SELL action when requiredAction is BOTH and terminal action is INHERIT', async () => {
      registry.register({
        id: 'plugin.guard.sell_mock',
        name: 'Mock Sell Guard',
        category: 'CHAN',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'SELL',
          reason: '缠论笔级三卖确认',
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_both',
        type: 'GUARD',
        name: '多空双向门禁',
        pluginId: 'plugin.guard.sell_mock',
        requiredAction: 'BOTH',
        onPass: {
          id: 'term_inherit',
          type: 'TERMINAL',
          action: 'INHERIT',
          signalTag: 'CHAN_BSP_SIGNAL',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.action).toBe('SELL');
      expect(result.signalTag).toBe('CHAN_BSP_SIGNAL');
    });

    it('enforces directional isolation: prevents SELL signal from entering BUY guard and routes to onFail with SELL preserved', async () => {
      registry.register({
        id: 'plugin.guard.upstream_sell',
        name: 'Upstream Sell Plugin',
        category: 'CHAN',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'SELL',
          badgeText: '3卖',
          reason: '缠论笔级三卖确认',
        }),
      });

      registry.register({
        id: 'plugin.guard.downstream_buy',
        name: 'Downstream Buy Enhancer',
        category: 'TECHNICAL',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'BUY',
          badgeText: '量价真实确认买',
          reason: '放量共振',
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_upstream',
        type: 'GUARD',
        name: '上游主形态门禁(BOTH)',
        pluginId: 'plugin.guard.upstream_sell',
        requiredAction: 'BOTH',
        onPass: {
          id: 'guard_downstream',
          type: 'GUARD',
          name: '下游量价买入增强(BUY)',
          pluginId: 'plugin.guard.downstream_buy',
          requiredAction: 'BUY',
          onPass: {
            id: 'term_enhanced_buy',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'ENHANCED_BUY',
          },
          onFail: {
            id: 'term_standard_fallback',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'STANDARD_FALLBACK',
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      // 必须阻止 SELL 被反向篡改为 BUY，顺利走入 onFail 兜底并继承 SELL 动作与原形态徽标
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.action).toBe('SELL');
      expect(result.signalTag).toBe('STANDARD_FALLBACK');
      expect(result.badgeText).toBe('3卖');

      // 验证白盒轨迹中记录了方向阻断信息
      const downstreamTrace = result.trace.find(
        (t) => t.nodeId === 'guard_downstream',
      );
      expect(downstreamTrace?.reason).toContain('方向隔离阻断');
    });
  });

  describe('BranchNode (Condition Routing)', () => {
    it('routes to true branch when blackboard attribute matches', async () => {
      const flow: DecisionFlowNode = {
        id: 'branch_regime',
        type: 'BRANCH',
        name: '大盘多空路由',
        condition: {
          attributeKey: 'market.regime',
          operator: 'eq',
          value: 'BULL',
        },
        branches: {
          true: {
            id: 'term_bull',
            type: 'TERMINAL',
            action: 'BUY',
            signalTag: 'BULL_STRATEGY',
          },
          false: {
            id: 'term_bear',
            type: 'TERMINAL',
            action: 'ABORT',
            reason: '非牛市环境，不执行该分支',
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map([['market.regime', 'BULL']]),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.signalTag).toBe('BULL_STRATEGY');
    });

    it('routes to false branch when condition does not match', async () => {
      const flow: DecisionFlowNode = {
        id: 'branch_regime',
        type: 'BRANCH',
        name: '大盘多空路由',
        condition: {
          attributeKey: 'market.regime',
          operator: 'eq',
          value: 'BULL',
        },
        branches: {
          true: {
            id: 'term_bull',
            type: 'TERMINAL',
            action: 'BUY',
          },
          false: {
            id: 'term_bear',
            type: 'TERMINAL',
            action: 'ABORT',
            reason: '震荡或弱市环境',
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map([['market.regime', 'BEAR']]),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('ABORTED');
      expect(result.reason).toBe('震荡或弱市环境');
    });
  });

  describe('ExtractorNode (Blackboard Enrichment)', () => {
    it('executes extractor plugin and exposes evidence to blackboard for downstream consumption', async () => {
      registry.register({
        id: 'plugin.extractor.chan',
        name: 'Chan Extractor',
        category: 'CHAN',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'NEUTRAL',
          reason: '中枢区间提取成功',
          evidence: { zd: 10.5, zg: 12.8 },
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'extractor_chan',
        type: 'EXTRACTOR',
        name: '提取中枢区间',
        pluginId: 'plugin.extractor.chan',
        exportAttributeKey: 'chan.central',
        next: {
          id: 'branch_after_extract',
          type: 'BRANCH',
          name: '中枢突破判断',
          condition: {
            attributeKey: 'chan.central',
            operator: 'ne',
            value: undefined,
          },
          branches: {
            true: {
              id: 'term_extracted',
              type: 'TERMINAL',
              action: 'BUY',
              signalTag: 'CENTRAL_EXTRACTED',
            },
            false: {
              id: 'term_abort',
              type: 'TERMINAL',
              action: 'ABORT',
            },
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.signalTag).toBe('CENTRAL_EXTRACTED');
      expect(context.attributes.get('chan.central')).toEqual({
        zd: 10.5,
        zg: 12.8,
      });
    });
  });

  describe('DecisionExecutionTraceBuilder', () => {
    it('builds structured snapshot and informative human-readable summary without confidence badges', () => {
      const result = {
        status: 'SIGNAL_EMITTED' as const,
        action: 'BUY' as const,
        signalTag: 'BREAKOUT_RESONANCE',
        reason: '决策流信号发射 (买入/开仓)',
        trace: [
          {
            nodeId: 'guard_1',
            type: 'GUARD' as const,
            name: '财务安全门禁',
            action: 'BUY' as const,
            reason: 'ROE达标',
          },
          {
            nodeId: 'term_1',
            type: 'TERMINAL' as const,
            action: 'BUY' as const,
            signalTag: 'BREAKOUT_RESONANCE',
          },
        ],
      };

      const snapshot = DecisionExecutionTraceBuilder.buildSnapshot(result);
      expect(snapshot.summary).not.toMatch(/\[(HIGH|MEDIUM|LOW)/);
      expect(snapshot.summary).not.toContain('%');
      expect(snapshot.summary).toBe(
        '门禁[财务安全门禁]通过 -> 触发买入信号 [BREAKOUT_RESONANCE]',
      );
    });
  });

  describe('LegacyStrategyCompiler', () => {
    it('compiles legacy rule into DecisionFlowNode and evaluates smoothly', async () => {
      registry.register(new LegacyRuleDslPlugin());

      const baseTime = new Date('2026-09-07T09:30:00Z');
      const bars = [
        makeMockBar(baseTime, 10, 10.5, 9.8, 10.2),
        makeMockBar(
          new Date(baseTime.getTime() + 60000),
          10.2,
          11.0,
          10.1,
          10.8,
        ),
      ];

      const rule = {
        all: [
          {
            field: 'k.close',
            operator: 'gt',
            value: 10.5,
          },
        ],
      };

      const flow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
        rule,
        'entry',
      );
      expect(flow.type).toBe('GUARD');

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(baseTime.getTime() + 60000),
        period: 5,
        attributes: new Map([[contextSeriesKey('000001', 5), bars]]),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.action).toBe('BUY');
      expect(result.signalTag).toBe('LEGACY_DSL');
    });
  });

  describe('Isomorphic Exit Flow & Position State Routing (出场插件同构与持仓状态路由)', () => {
    it('routes to exit branch when position is HOLDING and emits SELL with matchedSignalId evidence', async () => {
      // 注册模拟出场插件 (category = EXIT)
      registry.register({
        id: 'plugin.mock.lifecycle_exit',
        name: 'Mock Lifecycle Exit Plugin',
        category: 'EXIT',
        version: '1.0.0',
        description: 'Mock exit plugin for testing',
        evaluate: async (ctx: FactorContext) => {
          const pos = ctx.attributes.get('position.virtual') as any;
          if (pos?.state === 'HOLDING' && pos.activeEntries?.length > 0) {
            return {
              action: 'SELL',
              reason: '跌破成本防守线',
              badgeText: '破位止损',
              displayTag: 'EXIT_STOP',
              evidence: {
                matchedSignalId: pos.activeEntries[0].signalId,
                exitKind: 'STRUCTURAL_BREAKDOWN',
                triggerPrice: 10.5,
              },
            };
          }
          return { action: 'NEUTRAL', reason: '未触发出场' };
        },
      });

      // 注册模拟入场插件 (category = CHAN)
      registry.register({
        id: 'plugin.mock.entry',
        name: 'Mock Entry Plugin',
        category: 'CHAN',
        version: '1.0.0',
        description: 'Mock entry plugin',
        evaluate: async () => ({
          action: 'BUY',
          reason: '1买触发',
          badgeText: '1买',
        }),
      });

      // 构造持仓路由决策树: Branch -> (HOLDING -> Exit Guard -> SELL Terminal) / (FLAT -> Entry Guard -> BUY Terminal)
      const tree: DecisionFlowNode = {
        id: 'node.root.branch',
        type: 'BRANCH',
        name: '持仓状态路由',
        condition: {
          attributeKey: 'position.virtual.state',
          operator: 'eq',
          value: 'HOLDING',
        },
        branches: {
          true: {
            id: 'node.exit.guard',
            type: 'GUARD',
            name: '出场门禁',
            pluginId: 'plugin.mock.lifecycle_exit',
            requiredAction: 'SELL',
            onPass: {
              id: 'node.exit.terminal',
              type: 'TERMINAL',
              action: 'SELL',
              signalTag: 'TACTICAL_EXIT',
            },
          },
          false: {
            id: 'node.entry.guard',
            type: 'GUARD',
            name: '入场门禁',
            pluginId: 'plugin.mock.entry',
            requiredAction: 'BUY',
            onPass: {
              id: 'node.entry.terminal',
              type: 'TERMINAL',
              action: 'BUY',
              signalTag: 'TACTICAL_ENTRY',
            },
          },
        },
      };

      // 1. 测试 HOLDING 状态: 路由走出场分支，发射 SELL 信号
      const holdingContext: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date('2026-11-20T10:00:00Z'),
        period: 5,
        attributes: new Map([
          [
            'position.virtual',
            {
              state: 'HOLDING',
              totalWeight: 1.0,
              activeEntries: [
                { signalId: 'BUY_SIG_20261119_01', entryPrice: 11.0 },
              ],
            },
          ],
        ]),
      };

      const holdingResult = await evaluator.evaluate(tree, holdingContext);
      expect(holdingResult.status).toBe('SIGNAL_EMITTED');
      expect(holdingResult.action).toBe('SELL');
      expect(holdingResult.signalTag).toBe('TACTICAL_EXIT');
      expect(holdingResult.badgeText).toBe('破位止损');
      expect(holdingResult.evidence?.matchedSignalId).toBe(
        'BUY_SIG_20261119_01',
      );
      expect(holdingResult.evidence?.exitKind).toBe('STRUCTURAL_BREAKDOWN');

      // 2. 测试 FLAT 状态: 路由走入场分支，发射 BUY 信号
      const flatContext: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date('2026-11-20T10:00:00Z'),
        period: 5,
        attributes: new Map([
          [
            'position.virtual',
            {
              state: 'FLAT',
              totalWeight: 0,
              activeEntries: [],
            },
          ],
        ]),
      };

      const flatResult = await evaluator.evaluate(tree, flatContext);
      expect(flatResult.status).toBe('SIGNAL_EMITTED');
      expect(flatResult.action).toBe('BUY');
      expect(flatResult.signalTag).toBe('TACTICAL_ENTRY');
      expect(flatResult.badgeText).toBe('1买');
    });

    it('失败 GUARD 不污染 evidence / badgeText / pivot / traceChain', async () => {
      registry.register({
        id: 'plugin.guard.fail-a',
        name: '门禁A',
        category: 'TECHNICAL',
        version: '1.0.0',
        description: 'fail',
        evaluate: async () => ({
          action: 'NEUTRAL',
          reason: '未触发A',
          badgeText: 'A失败徽标',
          evidence: {
            eventType: 'FAIL_A',
            pivotTime: '2026-01-01T00:00:00.000Z',
            pivotPrice: 99,
          },
        }),
      });
      registry.register({
        id: 'plugin.guard.pass-b',
        name: '门禁B',
        category: 'TECHNICAL',
        version: '1.0.0',
        description: 'pass',
        evaluate: async () => ({
          action: 'BUY',
          reason: 'B突破成立',
          badgeText: 'B突破',
          evidence: {
            eventType: 'TEST_B',
            pivotTime: '2026-01-02T00:00:00.000Z',
            pivotPrice: 10,
          },
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_a',
        type: 'GUARD',
        name: '门禁A',
        pluginId: 'plugin.guard.fail-a',
        requiredAction: 'BUY',
        onPass: {
          id: 'term_a',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'TAG_A',
        },
        onFail: {
          id: 'guard_b',
          type: 'GUARD',
          name: '门禁B',
          pluginId: 'plugin.guard.pass-b',
          requiredAction: 'BUY',
          onPass: {
            id: 'term_b',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'TAG_B',
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date('2026-01-05T02:00:00.000Z'),
        period: 1440,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.badgeText).toBe('B突破');
      expect(result.evidence).toMatchObject({ eventType: 'TEST_B' });
      expect(result.trace[0]?.passed).toBe(false);
      expect(result.trace[1]?.passed).toBe(true);
      expect(extractPivotEvidence(result)).toEqual({
        pivotTime: '2026-01-02T00:00:00.000Z',
        pivotPrice: 10,
      });
      const chain = renderTraceChainOf({ trace: result.trace });
      expect(chain).toBe('门禁B ✓');
    });
  });
});
