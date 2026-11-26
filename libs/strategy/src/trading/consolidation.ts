/**
 * 组内同向信号归并、确定性主锚点选取与离线幂等键（取代 ordering.ts）。
 *
 * 原则（design.md §2）：
 * - 不存在置信度排序，所有有效同向信号以平等 contributors 归并成单；
 * - 损坏信号（triggerPrice <= 0）按条隔离拒绝，不毒害同向共振伙伴；
 * - 主锚点选举仅用于确定性 JSON 输出、primary idempotencyKey 与 referencePrice。
 */
import type { KernelSignal } from '../kernel/kernel.types';
import { SIGNAL_KINDS } from '../strategy.constants';
import type { AttributedSignal, SignalContributor } from './domain.types';
import { yuanToLi } from './money';
import { resolveIntent } from './rules';

const POSITIVE_BASE10_INT_PATTERN = /^[1-9]\d*$/;
const INTENT_EXIT = 'EXIT';

export interface ConsolidatedDirectionBuckets {
  readonly invalidPriceSignals: readonly AttributedSignal[];
  readonly validExits: readonly AttributedSignal[];
  readonly validEntries: readonly AttributedSignal[];
}

export function isPositiveBase10IntegerKey(key: string): boolean {
  return POSITIVE_BASE10_INT_PATTERN.test(key);
}

function signalPeriodOf(signal: KernelSignal): number {
  return signal.triggerPeriod ?? signal.channel?.period ?? 0;
}

/**
 * 确定性主锚点与贡献者排序比较器：
 * 1. 双方均为规范正整数实时 alertEventId 时按数值升序（"2" < "10"）；
 * 2. 否则依次按 period 降序 → definitionId 升序 → signalType 字典序 → idempotencyKey 字典序。
 */
export function compareContributorOrder(
  a: AttributedSignal,
  b: AttributedSignal,
): number {
  const aNumeric = isPositiveBase10IntegerKey(a.idempotencyKey);
  const bNumeric = isPositiveBase10IntegerKey(b.idempotencyKey);

  if (aNumeric && bNumeric) {
    const diff = BigInt(a.idempotencyKey) - BigInt(b.idempotencyKey);
    if (diff !== 0n) return diff < 0n ? -1 : 1;
    return 0;
  }
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1;
  }

  const periodDiff = signalPeriodOf(b.signal) - signalPeriodOf(a.signal);
  if (periodDiff !== 0) return periodDiff;

  const defDiff = a.signal.definitionId - b.signal.definitionId;
  if (defDiff !== 0) return defDiff;

  if (a.signal.signalType !== b.signal.signalType) {
    return a.signal.signalType < b.signal.signalType ? -1 : 1;
  }

  if (a.idempotencyKey !== b.idempotencyKey) {
    return a.idempotencyKey < b.idempotencyKey ? -1 : 1;
  }
  return 0;
}

/**
 * 将同组信号按价格合法性与意图拆分：
 * - `triggerPrice <= 0`（或非有限数）按方向隔离进 `invalidPriceSignals`（先出后进且确定性排序）；
 * - `validExits` 与 `validEntries` 各自按 `compareContributorOrder` 排序。
 */
export function consolidateGroupByDirection(
  signals: readonly AttributedSignal[],
): ConsolidatedDirectionBuckets {
  const invalidExits: AttributedSignal[] = [];
  const invalidEntries: AttributedSignal[] = [];
  const validExits: AttributedSignal[] = [];
  const validEntries: AttributedSignal[] = [];

  for (const item of signals) {
    const isExit =
      resolveIntent(item.signal) === INTENT_EXIT ||
      item.signal.signalKind === SIGNAL_KINDS.EXIT;
    const price = item.signal.triggerPrice;
    const priceInvalid = !Number.isFinite(price) || yuanToLi(price) <= 0n;

    if (priceInvalid) {
      if (isExit) {
        invalidExits.push(item);
      } else {
        invalidEntries.push(item);
      }
      continue;
    }

    if (isExit) {
      validExits.push(item);
    } else {
      validEntries.push(item);
    }
  }

  invalidExits.sort(compareContributorOrder);
  invalidEntries.sort(compareContributorOrder);
  validExits.sort(compareContributorOrder);
  validEntries.sort(compareContributorOrder);

  return {
    invalidPriceSignals: [...invalidExits, ...invalidEntries],
    validExits,
    validEntries,
  };
}

export function toSignalContributor(
  attributed: AttributedSignal,
): SignalContributor {
  return {
    idempotencyKey: attributed.idempotencyKey,
    signalType: attributed.signal.signalType,
    attribution: attributed.attribution,
  };
}

/**
 * 离线合成幂等键（REQ-FACADE-04）：包含 definitionId、period、signalTime、signalKind、signalType，
 * 确保多周期同刻对齐及同刻 VIRTUAL_EXIT 与策略 EXIT 绝不撞键。
 */
export function buildOfflineSignalIdempotencyKey(
  signal: Pick<
    KernelSignal,
    'definitionId' | 'signalTime' | 'signalKind' | 'signalType'
  >,
  period: number,
): string {
  return `offline-${signal.definitionId}-${period}-${signal.signalTime.getTime()}-${signal.signalKind}-${signal.signalType}`;
}
