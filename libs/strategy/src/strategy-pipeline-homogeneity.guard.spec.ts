import * as fs from 'fs';
import * as path from 'path';
import type { StrategyBar } from '@app/market-data';
import {
  compileStoredStrategyRule,
  HistoricalBarSource,
  RealtimeKernelPool,
  StrategyEvaluationKernel,
  type RealtimeStrategyExecutionPlan,
} from '@app/strategy';
import { StrategySimulationSession } from './simulation/strategy-simulation.session';
import { availabilityKey } from './kernel/availability';
import { mapKernelSignalToSimulationSignal } from './simulation/kernel-signal-mapper';

/**
 * 策略求值管线同构门禁（Pipeline Homogeneity Guard）
 *
 * 架构契约：实时链路、单步推演、批量回测必须走同一实时引擎数据流
 * （bar 输入 → 滑窗 → 策略树 → 当期增量信号），仅输入/输出适配不同。
 * 1) 静态扫描：apps/* 禁止绕过统一内核直连 chan-bsp detector/cursor 或
 *    legacy DSL 求值器；求值执行层禁止 legacy kind 运行时分派。
 * 2) 运行时三路 parity：同一 bar 序列分别经 HistoricalBarSource→内核、
 *    RealtimeKernelPool→内核、会话驱动，逐条信号必须一致。
 */

const APP_SOURCE_ROOTS = [
  path.join(__dirname, '../../../apps/signal/src'),
  path.join(__dirname, '../../../apps/backtest/src'),
  path.join(__dirname, '../../../apps/mist/src'),
];

const FORBIDDEN_IMPORT_PATTERN =
  /from\s+'[^']*(ChanBspDetector|chan-bsp\.detector|ChanBspEpisodeCursor|chan-bsp\.episode|evaluateStrategyPlan)/;

const FORBIDDEN_KIND_DISPATCH =
  /(plan|execution|run)\.kind\s*===\s*'(chan_bsp|rule_dsl)'/;

/** 编译边界的 kind 快照枚举映射允许（backtest_runs.kind 落库语义），非求值分派。 */
const ALLOWLIST_FILES = new Set<string>([
  path.join(
    __dirname,
    '../../../apps/mist/src/strategy/services/backtest-run-command.service.ts',
  ),
]);

function listTsFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

describe('Strategy Pipeline Homogeneity Guard (三链路同构门禁)', () => {
  describe('1. 静态源码扫描', () => {
    it('apps/* 禁止 import chan-bsp detector/cursor 与 legacy DSL 求值器', () => {
      const violations: string[] = [];
      for (const root of APP_SOURCE_ROOTS) {
        for (const file of listTsFiles(root)) {
          if (ALLOWLIST_FILES.has(file)) continue;
          const source = fs.readFileSync(file, 'utf8');
          if (FORBIDDEN_IMPORT_PATTERN.test(source)) {
            violations.push(path.relative(process.cwd(), file));
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('求值执行层禁止 legacy kind 运行时分派分支', () => {
      const violations: string[] = [];
      for (const root of APP_SOURCE_ROOTS) {
        for (const file of listTsFiles(root)) {
          if (ALLOWLIST_FILES.has(file)) continue;
          const source = fs.readFileSync(file, 'utf8');
          if (FORBIDDEN_KIND_DISPATCH.test(source)) {
            violations.push(path.relative(process.cwd(), file));
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe('2. 三路运行时 parity（同一 bar 序列，信号逐条一致）', () => {
    const REQUIRED_BAR_COUNT = 2;
    const BAR_COUNT = 26;
    const PRE_WARM_COUNT = 10;
    const baseTime = new Date('2026-08-04T01:30:00.000Z').getTime();

    function makeBars(count: number, startOffset = 0): StrategyBar[] {
      const bars: StrategyBar[] = [];
      let price = 10;
      for (let i = 0; i < count; i += 1) {
        price += Math.sin((startOffset + i) / 4) * 0.4;
        const close = Math.round(price * 100) / 100;
        bars.push({
          securityId: 9,
          source: 'tdx',
          period: 1,
          timestamp: new Date(baseTime + (startOffset + i) * 60_000),
          open: close - 0.1,
          high: close + 0.3,
          low: close - 0.3,
          close,
          volume: '1000',
          amount: '10000',
          type: 'complete',
        });
      }
      return bars;
    }

    const preWarmBars = makeBars(PRE_WARM_COUNT);
    const publicBars = makeBars(BAR_COUNT - PRE_WARM_COUNT, PRE_WARM_COUNT);
    const allBars = [...preWarmBars, ...publicBars];
    const publicFrom = publicBars[0].timestamp;

    const compiledRule = compileStoredStrategyRule(
      { field: 'k.close', operator: 'gt', value: 1 },
      'entry',
    );
    const flow = {
      id: 'guard_legacy_rule',
      type: 'GUARD' as const,
      name: '存量规则门禁',
      pluginId: 'plugin.legacy.rule-dsl',
      params: { plan: compiledRule },
      requiredAction: 'BUY' as const,
      minConfidence: 0.5,
      onPass: {
        id: 'term_pass',
        type: 'TERMINAL' as const,
        action: 'BUY' as const,
        signalTag: 'LEGACY_DSL',
        reason: 'matched',
      },
      onFail: {
        id: 'term_fail',
        type: 'TERMINAL' as const,
        action: 'ABORT' as const,
        reason: 'unmatched',
      },
    };
    const ruleSnapshot = Object.freeze({
      field: 'k.close',
      operator: 'gt',
      value: 1,
    });

    type ComparableSimulationSignal =
      ReturnType<typeof mapKernelSignalToSimulationSignal> extends never
        ? never
        : {
            signalTime: string;
            triggerTime: string;
            pivotTime: string;
            triggerPrice: number;
            signalType: string;
            isBuy: boolean;
          };

    function toComparable(simulation: ComparableSimulationSignal) {
      return {
        signalTime: simulation.signalTime,
        triggerTime: simulation.triggerTime,
        pivotTime: simulation.pivotTime,
        triggerPrice: simulation.triggerPrice,
        signalType: simulation.signalType,
        signalKind: simulation.isBuy ? 'entry' : 'exit',
      };
    }

    it('HistoricalBarSource→内核 与 RealtimeKernelPool→内核 与 会话驱动 三路一致', async () => {
      // Lane A：历史回放（回测）— 预热段 + 单页公开区间
      const laneA: ComparableSimulationSignal[] = [];
      const kernelA = new StrategyEvaluationKernel({
        securityId: 9,
        securityCode: '600000.SH',
        publicFrom,
        plans: [
          {
            definitionId: 1,
            versionId: 1,
            flow,
            ruleSnapshot,
            period: 1,
            requiredBarCount: REQUIRED_BAR_COUNT,
            contextRequirements: {},
          },
        ],
      });
      const source = new HistoricalBarSource(
        {
          loadReplayWindow: jest.fn().mockResolvedValue({ bars: preWarmBars }),
          readReplayPage: jest.fn().mockResolvedValue({
            bars: publicBars,
            nextAfterTimestamp: null,
          }),
        },
        {
          securityId: 9,
          selection: { kind: 'provider', source: 'tdx' },
          evaluationPeriod: 1,
          contextPeriods: {},
          preWarmEndAt: publicFrom,
          publicFrom,
          endAt: allBars[allBars.length - 1].timestamp,
          requiredBars: REQUIRED_BAR_COUNT,
        },
      );
      await source.drive(kernelA, (signal) => {
        laneA.push(
          mapKernelSignalToSimulationSignal(signal, {
            securityCode: '600000.SH',
            period: 1,
          }),
        );
      });

      // Lane B：实时（封存 bar 逐根触发）— hydration 预热段 + 逐根公开 bar
      const kernelPool = new RealtimeKernelPool({
        loadRealtimeWindow: jest
          .fn()
          .mockResolvedValue({ bars: [...preWarmBars] }),
        resolveRealtimeObservation: jest.fn(),
      });
      const plans: RealtimeStrategyExecutionPlan[] = [
        {
          definitionId: 1,
          versionId: 1,
          source: 'tdx',
          period: 1,
          ruleSnapshot,
          kind: 'decision_flow',
          flow,
          signalKind: 'entry',
          requiredBarCount: REQUIRED_BAR_COUNT,
          contextRequirements: {},
        },
      ];
      const laneB: ComparableSimulationSignal[] = [];
      for (const bar of publicBars) {
        const signals = await kernelPool.push(bar, plans);
        for (const signal of signals) {
          const mapped = mapKernelSignalToSimulationSignal(signal, {
            securityCode: '600000.SH',
            period: 1,
          });
          laneB.push({
            signalTime: mapped.signalTime,
            triggerTime: mapped.triggerTime,
            pivotTime: mapped.pivotTime,
            triggerPrice: mapped.triggerPrice,
            signalType: mapped.signalType,
            isBuy: mapped.isBuy,
          });
        }
      }

      // Lane C：本地会话（单步推演）— 内核 + 帧缓存壳
      const session = new StrategySimulationSession(allBars, {
        securityId: 9,
        securityCode: '600000.SH',
        period: 1,
        startDate: publicFrom,
        flow,
        windowBudget: REQUIRED_BAR_COUNT,
      });
      const laneC: ComparableSimulationSignal[] = [];
      while (session.currentCursor < session.totalBars - 1) {
        const frame = await session.stepNext();
        if (!frame) break;
        for (const signal of frame.latestSignals ?? []) {
          laneC.push(signal);
        }
      }

      // 三路必须逐条一致
      expect(laneA.length).toBeGreaterThan(0);
      expect(laneB).toHaveLength(laneA.length);
      expect(laneC).toHaveLength(laneA.length);
      const comparableA = laneA.map(toComparable);
      const comparableB = laneB.map(toComparable);
      const comparableC = laneC.map(toComparable);
      expect(comparableB).toEqual(comparableA);
      expect(comparableC).toEqual(comparableA);
    });

    describe('3. 多周期三路 parity（30m 求值 + 5m context，orderKey 归并序）', () => {
      const EVAL_REQUIRED = 2;
      const CONTEXT_REQUIRED = 4;
      const BAR30_COUNT = 8;
      const PRE_WARM_30 = 1;
      const base = Date.UTC(2026, 8, 4, 1, 30); // 09:30 上海
      const publicFrom = new Date(base);

      function make30(count: number, startSlot: number): StrategyBar[] {
        return Array.from({ length: count }, (_, i) => {
          const close =
            Math.round((10 + Math.sin((startSlot + i) / 3) * 0.4) * 100) / 100;
          return {
            securityId: 9,
            source: 'tdx' as const,
            period: 30,
            timestamp: new Date(base + (startSlot + i) * 30 * 60_000),
            open: close - 0.1,
            high: close + 0.3,
            low: close - 0.3,
            close,
            volume: '1000',
            amount: '10000',
            type: 'complete' as const,
          };
        });
      }

      function make5(count: number, startSlot: number): StrategyBar[] {
        return Array.from({ length: count }, (_, i) => {
          const close =
            Math.round((10 + Math.sin((startSlot + i) / 3) * 0.4) * 100) / 100;
          return {
            securityId: 9,
            source: 'tdx' as const,
            period: 5,
            timestamp: new Date(base + (startSlot + i) * 5 * 60_000),
            open: close - 0.1,
            high: close + 0.3,
            low: close - 0.3,
            close,
            volume: '1000',
            amount: '10000',
            type: 'complete' as const,
          };
        });
      }

      // 5m 覆盖 [base-15min, base+210min]；30m 覆盖 [base-30min, base+210min]
      const bars5Pre = make5(3, -3);
      const bars5Public = make5(43, 0);
      const bars30Pre = make30(PRE_WARM_30, -1);
      const bars30Public = make30(BAR30_COUNT - PRE_WARM_30, 0);
      const merged = [
        ...bars5Pre,
        ...bars30Pre,
        ...bars5Public,
        ...bars30Public,
      ].sort((left, right) => {
        const leftKey = availabilityKey(left).getTime();
        const rightKey = availabilityKey(right).getTime();
        return leftKey - rightKey || left.period - right.period;
      });

      const plans = [
        {
          definitionId: 1,
          versionId: 1,
          flow: {
            id: 'guard_legacy_rule',
            type: 'GUARD' as const,
            name: '存量规则门禁',
            pluginId: 'plugin.legacy.rule-dsl',
            params: {
              plan: compileStoredStrategyRule(
                { field: 'k.close', operator: 'gt', value: 1 },
                'entry',
              ),
            },
            requiredAction: 'BUY' as const,
            minConfidence: 0.5,
            onPass: {
              id: 'term_pass',
              type: 'TERMINAL' as const,
              action: 'BUY' as const,
              signalTag: 'LEGACY_DSL',
              reason: 'matched',
            },
          },
          ruleSnapshot: Object.freeze({
            field: 'k.close',
            operator: 'gt',
            value: 1,
          }),
          source: 'tdx' as const,
          period: 30,
          requiredBarCount: EVAL_REQUIRED,
          contextRequirements: { 5: CONTEXT_REQUIRED },
          kind: 'decision_flow' as const,
          signalKind: 'entry' as const,
        },
      ];
      const kernelPlan = [
        {
          definitionId: 1,
          versionId: 1,
          flow: plans[0].flow,
          ruleSnapshot: plans[0].ruleSnapshot,
          period: 30,
          requiredBarCount: EVAL_REQUIRED,
          contextRequirements: { 5: CONTEXT_REQUIRED },
        },
      ];

      function toComparableList(
        signals: readonly {
          signalTime: string;
          triggerTime: string;
          pivotTime: string;
          triggerPrice: number;
          signalType: string;
          isBuy: boolean;
        }[],
      ) {
        return signals.map((signal) => ({
          signalTime: signal.signalTime,
          triggerTime: signal.triggerTime,
          pivotTime: signal.pivotTime,
          triggerPrice: signal.triggerPrice,
          signalType: signal.signalType,
          signalKind: signal.isBuy ? 'entry' : 'exit',
        }));
      }

      it('HistoricalBarSource 与 RealtimeKernelPool 与 会话驱动 三路一致（多周期）', async () => {
        // Lane A：历史回放（多序列归并）
        const laneA: {
          signalTime: string;
          triggerTime: string;
          pivotTime: string;
          triggerPrice: number;
          signalType: string;
          isBuy: boolean;
        }[] = [];
        const kernelA = new StrategyEvaluationKernel({
          securityId: 9,
          securityCode: '600000.SH',
          publicFrom,
          plans: kernelPlan,
        });
        const source = new HistoricalBarSource(
          {
            loadReplayWindow: jest
              .fn()
              .mockImplementation(
                (criteria: { period: number; endAt: Date }) => ({
                  bars: merged.filter(
                    (bar) =>
                      bar.period === criteria.period &&
                      bar.timestamp < criteria.endAt,
                  ),
                }),
              ),
            readReplayPage: jest
              .fn()
              .mockImplementation(
                (criteria: { period: number; startAt: Date; endAt: Date }) => ({
                  bars: merged.filter(
                    (bar) =>
                      bar.period === criteria.period &&
                      bar.timestamp >= criteria.startAt &&
                      bar.timestamp <= criteria.endAt,
                  ),
                  nextAfterTimestamp: null,
                }),
              ),
          },
          {
            securityId: 9,
            selection: { kind: 'provider', source: 'tdx' },
            evaluationPeriod: 30,
            contextPeriods: { 5: CONTEXT_REQUIRED },
            preWarmEndAt: publicFrom,
            publicFrom,
            endAt: merged[merged.length - 1].timestamp,
            requiredBars: EVAL_REQUIRED,
          },
        );
        await source.drive(kernelA, (signal) => {
          laneA.push(
            mapKernelSignalToSimulationSignal(signal, {
              securityCode: '600000.SH',
              period: 30,
            }),
          );
        });

        // Lane B：实时（合并流逐根入池；hydration 与流重复的部分由内核游标去重）
        const kernelPool = new RealtimeKernelPool({
          loadRealtimeWindow: jest
            .fn()
            .mockImplementation(
              (criteria: { period: number; anchorAvailabilityMs: number }) => ({
                bars: merged.filter(
                  (bar) =>
                    bar.period === criteria.period &&
                    availabilityKey(bar).getTime() <
                      criteria.anchorAvailabilityMs,
                ),
              }),
            ),
          resolveRealtimeObservation: jest.fn(),
        });
        const laneB: {
          signalTime: string;
          triggerTime: string;
          pivotTime: string;
          triggerPrice: number;
          signalType: string;
          isBuy: boolean;
        }[] = [];
        for (const bar of merged) {
          const signals = await kernelPool.push(bar, plans);
          for (const signal of signals) {
            laneB.push(
              mapKernelSignalToSimulationSignal(signal, {
                securityCode: '600000.SH',
                period: 30,
              }),
            );
          }
        }

        // Lane C：本地会话（合并流 + 求值周期配置）
        const session = new StrategySimulationSession(merged, {
          securityId: 9,
          securityCode: '600000.SH',
          period: 30,
          startDate: publicFrom,
          flow: plans[0].flow,
          windowBudget: EVAL_REQUIRED,
          contextRequirements: { 5: CONTEXT_REQUIRED },
        });
        const laneC: {
          signalTime: string;
          triggerTime: string;
          pivotTime: string;
          triggerPrice: number;
          signalType: string;
          isBuy: boolean;
        }[] = [];
        while (session.currentCursor < session.totalBars - 1) {
          const frame = await session.stepNext();
          if (!frame) break;
          for (const signal of frame.latestSignals ?? []) {
            laneC.push(signal);
          }
        }

        expect(laneA.length).toBeGreaterThan(0);
        expect(laneB).toHaveLength(laneA.length);
        expect(laneC).toHaveLength(laneA.length);
        expect(toComparableList(laneB)).toEqual(toComparableList(laneA));
        expect(toComparableList(laneC)).toEqual(toComparableList(laneA));
      });
    });
  });
});
