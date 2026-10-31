import type { StrategyBar } from '@app/market-data';
import { availabilityKey } from '../availability';
import {
  reduceSlot,
  reduceDaily,
  resolveSessionPosition,
  shanghaiMidnightOf,
} from './period-aggregation.helper';

/**
 * 从左标 1m 桶批量派生右标周期 bar（hydration/重启补齐用）。
 *
 * 语义必须与增量 `RealtimePeriodBuilder` 逐 trigger 闭合的结果逐根一致：
 * - 归属：事件时间 [S, S+period) 内的桶（左标 ∈ [S, S+period)）属于槽 S；
 * - 标签：右标 = S + period；session 末根吸收终端桶（11:30/15:00，左标恰等于槽末）
 *   作为可选成分，闭合于终端桶；
 * - 完整性：只按常规成分根数判（终端桶缺席不标 incomplete）；
 * - 日线（1440）：当日全部桶聚合，标签 00:00(D)，complete 当且仅当 242 桶齐；
 * - 因果过滤：availabilityKey(bar) < anchorAvailabilityMs 时才输出（进行中 slot
 *   与将在当前触发闭合的 bar 不得注入——它们由增量 builder 现场闭合）。
 */
export function deriveRightLabeledPeriodBars(
  oneMinuteBars: readonly StrategyBar[],
  period: 5 | 15 | 30 | 60 | 1440,
  options?: { readonly anchorAvailabilityMs?: number },
): StrategyBar[] {
  const anchorAvailabilityMs =
    options?.anchorAvailabilityMs ?? Number.POSITIVE_INFINITY;
  if (period === 1440) {
    return [deriveDaily(oneMinuteBars)].filter(
      (bar): bar is StrategyBar =>
        bar !== null && availabilityKey(bar).getTime() < anchorAvailabilityMs,
    );
  }

  const slots = new Map<number, Map<number, StrategyBar>>();
  for (const bar of oneMinuteBars) {
    let position;
    try {
      position = resolveSessionPosition(bar.timestamp, 'sealed bar');
    } catch {
      // 15:01/15:02 死桶等 session 外 bar 跳过（volume 恒 0，无行情损失）
      continue;
    }
    const slotOffset = Math.floor(position.minuteOffset / period) * period;
    const slotStartMs = position.sessionStartMs + slotOffset * 60_000;
    const bucket = slots.get(slotStartMs) ?? new Map<number, StrategyBar>();
    bucket.set(bar.timestamp.getTime(), bar);
    slots.set(slotStartMs, bucket);
  }

  const derived: StrategyBar[] = [];
  for (const [slotStartMs, buckets] of slots) {
    if (buckets.size === 0) continue;
    const first = buckets.values().next().value!;
    const bar = reduceSlot(
      first.securityId,
      first.source,
      period,
      slotStartMs,
      buckets,
      first.securityCode,
    );
    if (!bar) continue;
    if (availabilityKey(bar).getTime() < anchorAvailabilityMs) {
      derived.push(bar);
    }
  }
  return derived.sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
}

/** 日线聚合：无 15:00 终端桶（当日未闭合/全 discarded）时不产出。 */
function deriveDaily(
  oneMinuteBars: readonly StrategyBar[],
): StrategyBar | null {
  if (oneMinuteBars.length === 0) return null;
  const buckets = new Map<number, StrategyBar>();
  for (const bar of oneMinuteBars) buckets.set(bar.timestamp.getTime(), bar);
  const ordered = [...buckets.values()].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );
  const first = ordered[0];
  const last = ordered.at(-1)!;
  const tradingDayMs = shanghaiMidnightOf(last.timestamp).getTime();
  return reduceDaily(
    first.securityId,
    first.source,
    tradingDayMs,
    buckets,
    first.securityCode,
  );
}
