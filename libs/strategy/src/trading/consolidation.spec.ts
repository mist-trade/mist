/**
 * 同向信号归并、确定性主锚点选取与离线幂等键单测（consolidation.ts）。
 */
import type { KernelSignal } from '../kernel/kernel.types';
import type { AttributedSignal } from './domain.types';
import {
  buildOfflineSignalIdempotencyKey,
  compareContributorOrder,
  consolidateGroupByDirection,
  toSignalContributor,
} from './consolidation';

const SIGNAL_TIME = new Date('2026-01-15T07:35:00.000Z');

function makeKernelSignal(overrides: Partial<KernelSignal> = {}): KernelSignal {
  return {
    definitionId: 1,
    versionId: 1,
    signalKind: 'entry',
    signalTime: SIGNAL_TIME,
    triggerPrice: 12.5,
    pivotTime: null,
    pivotPrice: null,
    signalType: 'CHAN_SECOND_BUY',
    decisionTrace: {},
    contextSnapshot: {},
    ruleSnapshot: {},
    ...overrides,
  };
}

function makeAttributed(
  idempotencyKey: string,
  signalOverrides: Partial<KernelSignal> = {},
): AttributedSignal {
  const signal = makeKernelSignal(signalOverrides);
  return {
    idempotencyKey,
    signal,
    attribution: {
      strategyName: `策略-${signal.definitionId}`,
      periodLabel: `${signal.triggerPeriod ?? signal.channel?.period ?? 30}m`,
      traceChain: null,
    },
  };
}

describe('consolidation（同向信号归并原语）', () => {
  describe('compareContributorOrder', () => {
    it('实时正整数 alertEventId 按数值升序（"2" < "10"）', () => {
      const s10 = makeAttributed('10', { definitionId: 1 });
      const s2 = makeAttributed('2', { definitionId: 99 });
      const s100 = makeAttributed('100', { definitionId: 50 });

      const sorted = [s10, s100, s2].sort(compareContributorOrder);
      expect(sorted.map((s) => s.idempotencyKey)).toEqual(['2', '10', '100']);
    });

    it('支持超大整数 idempotencyKey 精确 BigInt 比较', () => {
      const big2 = makeAttributed('9007199254740993');
      const big1 = makeAttributed('9007199254740992');

      const sorted = [big2, big1].sort(compareContributorOrder);
      expect(sorted.map((s) => s.idempotencyKey)).toEqual([
        '9007199254740992',
        '9007199254740993',
      ]);
    });

    it('离线合成键依次按 period 降序 → definitionId 升序 → signalType 字典序 → idempotencyKey 字典序', () => {
      const a30Def1 = makeAttributed('offline-1-30-a', {
        triggerPeriod: 30,
        definitionId: 1,
        signalType: 'CHAN_SECOND_BUY',
      });
      const b1440Def2 = makeAttributed('offline-2-1440-b', {
        triggerPeriod: 1440,
        definitionId: 2,
        signalType: 'GOLDEN_POCKET',
      });
      const c30Def2TypeB = makeAttributed('offline-2-30-b', {
        triggerPeriod: 30,
        definitionId: 2,
        signalType: 'B_SIGNAL',
      });
      const d30Def2TypeAKey2 = makeAttributed('offline-2-30-a2', {
        triggerPeriod: 30,
        definitionId: 2,
        signalType: 'A_SIGNAL',
      });
      const e30Def2TypeAKey1 = makeAttributed('offline-2-30-a1', {
        triggerPeriod: 30,
        definitionId: 2,
        signalType: 'A_SIGNAL',
      });

      const sorted = [
        d30Def2TypeAKey2,
        c30Def2TypeB,
        a30Def1,
        e30Def2TypeAKey1,
        b1440Def2,
      ].sort(compareContributorOrder);

      expect(sorted.map((s) => s.idempotencyKey)).toEqual([
        'offline-2-1440-b',
        'offline-1-30-a',
        'offline-2-30-a1',
        'offline-2-30-a2',
        'offline-2-30-b',
      ]);
    });
  });

  describe('buildOfflineSignalIdempotencyKey', () => {
    it('包含 definitionId / period / signalTimeMs / signalKind / signalType', () => {
      const key = buildOfflineSignalIdempotencyKey(
        makeKernelSignal({
          definitionId: 7,
          signalKind: 'entry',
          signalType: 'CHAN_FIRST_BUY',
        }),
        30,
      );
      expect(key).toBe(
        `offline-7-30-${SIGNAL_TIME.getTime()}-entry-CHAN_FIRST_BUY`,
      );
    });

    it('同定义同刻不同周期（1440m 与 30m）及同周期 VIRTUAL_EXIT 与常规 EXIT 绝不撞键', () => {
      const kDaily = buildOfflineSignalIdempotencyKey(
        makeKernelSignal({
          definitionId: 1,
          signalKind: 'exit',
          signalType: 'CHAN_SECOND_SELL',
        }),
        1440,
      );
      const k30 = buildOfflineSignalIdempotencyKey(
        makeKernelSignal({
          definitionId: 1,
          signalKind: 'exit',
          signalType: 'CHAN_SECOND_SELL',
        }),
        30,
      );
      const kVirtualExit = buildOfflineSignalIdempotencyKey(
        makeKernelSignal({
          definitionId: 1,
          signalKind: 'exit',
          signalType: 'VIRTUAL_EXIT',
        }),
        30,
      );

      expect(new Set([kDaily, k30, kVirtualExit]).size).toBe(3);
    });
  });

  describe('consolidateGroupByDirection', () => {
    it('按意图拆分为 invalidPriceSignals / validExits / validEntries 并保持确定性排序', () => {
      const badExit = makeAttributed('bad-exit', {
        signalKind: 'exit',
        triggerPrice: 0,
      });
      const badEntry = makeAttributed('bad-entry', {
        signalKind: 'entry',
        triggerPrice: -1,
      });
      const exit30 = makeAttributed('exit-30', {
        signalKind: 'exit',
        triggerPeriod: 30,
        triggerPrice: 12,
      });
      const exit1440 = makeAttributed('exit-1440', {
        signalKind: 'exit',
        triggerPeriod: 1440,
        triggerPrice: 12.2,
      });
      const entry2 = makeAttributed('10', {
        signalKind: 'entry',
        triggerPrice: 11,
      });
      const entry1 = makeAttributed('2', {
        signalKind: 'entry',
        triggerPrice: 11.2,
      });

      const buckets = consolidateGroupByDirection([
        entry2,
        badEntry,
        exit30,
        badExit,
        entry1,
        exit1440,
      ]);

      expect(buckets.invalidPriceSignals.map((s) => s.idempotencyKey)).toEqual([
        'bad-exit',
        'bad-entry',
      ]);
      expect(buckets.validExits.map((s) => s.idempotencyKey)).toEqual([
        'exit-1440',
        'exit-30',
      ]);
      expect(buckets.validEntries.map((s) => s.idempotencyKey)).toEqual([
        '2',
        '10',
      ]);
    });

    it('严格通过 resolveIntent 判定出场意图（RISK_CUT 入出场桶，intent=ENTRY 即使 signalKind=exit 也不绕过）', () => {
      const riskCut = makeAttributed('risk-cut', {
        signalKind: 'entry',
        intent: 'RISK_CUT',
        triggerPrice: 11.5,
      });
      const explicitEntryOverride = makeAttributed('override-entry', {
        signalKind: 'exit',
        intent: 'ENTRY',
        triggerPrice: 12.0,
      });
      const badRiskCut = makeAttributed('bad-risk-cut', {
        signalKind: 'entry',
        intent: 'RISK_CUT',
        triggerPrice: 0,
      });

      const buckets = consolidateGroupByDirection([
        explicitEntryOverride,
        riskCut,
        badRiskCut,
      ]);

      expect(buckets.invalidPriceSignals.map((s) => s.idempotencyKey)).toEqual([
        'bad-risk-cut',
      ]);
      expect(buckets.validExits.map((s) => s.idempotencyKey)).toEqual([
        'risk-cut',
      ]);
      expect(buckets.validEntries.map((s) => s.idempotencyKey)).toEqual([
        'override-entry',
      ]);
    });
  });

  describe('toSignalContributor', () => {
    it('透传可选元数据 pivotPrice / originPluginId / ruleSnapshot', () => {
      const sig = makeAttributed('k1', {
        pivotPrice: 11.8,
        originPluginId: 'plugin.test.sample',
        ruleSnapshot: { threshold: 2 },
      });
      expect(toSignalContributor(sig)).toEqual({
        idempotencyKey: 'k1',
        signalType: 'CHAN_SECOND_BUY',
        attribution: sig.attribution,
        pivotPrice: 11.8,
        originPluginId: 'plugin.test.sample',
        ruleSnapshot: { threshold: 2 },
      });
    });
  });
});
