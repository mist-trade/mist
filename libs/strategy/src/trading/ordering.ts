/**
 * 组内排序策略（REQ-ENGINE-02 / REQ-ENGINE-06）。
 *
 * interim 实现：先出后进（EXIT 先于 ENTRY；同 kind 内按置信度降序；
 * 置信度同则按幂等锚点字典序——确定性平局规则）。未来"冲突裁决因子"
 * 定稿后整体替换本策略，不动引擎主体。
 */
import type { AttributedSignal } from './domain.types';

export interface GroupOrderingStrategy {
  readonly id: string;
  order(signals: readonly AttributedSignal[]): readonly AttributedSignal[];
}

function confidenceOf(signal: AttributedSignal): number {
  return signal.attribution.confidence ?? signal.signal.confidence;
}

function exitOf(signal: AttributedSignal): 0 | 1 {
  const intent =
    signal.signal.intent ??
    (signal.signal.signalKind === 'exit' ? 'EXIT' : 'ENTRY');
  return intent === 'EXIT' ? 0 : 1;
}

/** interim 默认序：先出后进、置信度降序、幂等锚点字典序。 */
export const sellFirstByConfidence: GroupOrderingStrategy = {
  id: 'sell-first-by-confidence',
  order(signals) {
    return [...signals].sort((a, b) => {
      const exitDiff = exitOf(a) - exitOf(b);
      if (exitDiff !== 0) return exitDiff;
      const confDiff = confidenceOf(b) - confidenceOf(a);
      if (confDiff !== 0) return confDiff;
      return a.idempotencyKey < b.idempotencyKey
        ? -1
        : a.idempotencyKey > b.idempotencyKey
          ? 1
          : 0;
    });
  },
};
