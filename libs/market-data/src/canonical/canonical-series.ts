import type { DataSource } from '@app/shared-data';
import type { StrategyBar } from '../strategy-bar';
import type { ResolvedSegment } from './splice-policy.types';

const RANGE_PAGE_SIZE = 1_000;
const ONE_MILLISECOND = 1;

export interface CanonicalSegmentRead {
  readonly securityId: number;
  readonly source: DataSource;
  readonly period: number;
  /** Inclusive lower bound, null for unbounded. */
  readonly from: Date | null;
  /** Exclusive upper bound, null for unbounded. */
  readonly before: Date | null;
  /** Exclusive cursor. */
  readonly afterTimestamp: Date | null;
  readonly order: 'asc' | 'desc';
  readonly limit: number;
}

export interface CanonicalSegmentReader {
  read(params: CanonicalSegmentRead): Promise<readonly StrategyBar[]>;
}

export interface CanonicalWindowParams {
  readonly securityId: number;
  readonly period: number;
  readonly endAt: Date;
  readonly requiredBars: number;
}

export interface CanonicalRangeParams {
  readonly securityId: number;
  readonly period: number;
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface CanonicalPageParams extends CanonicalRangeParams {
  readonly afterTimestamp?: Date;
  readonly limit: number;
}

export interface CanonicalPage {
  readonly bars: readonly StrategyBar[];
  readonly nextAfterTimestamp: Date | null;
}

function maxDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function minDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function ascending(left: StrategyBar, right: StrategyBar): number {
  return left.timestamp.getTime() - right.timestamp.getTime();
}

/**
 * Load the newest `requiredBars` bars strictly before `endAt`, walking segments
 * from last to first. Returns bars in ascending timestamp order.
 */
export async function loadCanonicalWindow(
  reader: CanonicalSegmentReader,
  segments: readonly ResolvedSegment[],
  params: CanonicalWindowParams,
): Promise<readonly StrategyBar[]> {
  const collected: StrategyBar[] = [];

  for (
    let index = segments.length - 1;
    index >= 0 && collected.length < params.requiredBars;
    index -= 1
  ) {
    const segment = segments[index];
    const upper = minDate(segment.before, params.endAt);
    const lower = segment.from;
    if (lower && upper && lower.getTime() >= upper.getTime()) continue;

    const bars = await reader.read({
      securityId: params.securityId,
      source: segment.source,
      period: params.period,
      from: lower,
      before: upper,
      afterTimestamp: null,
      order: 'desc',
      limit: params.requiredBars - collected.length,
    });
    collected.push(...bars);
  }

  collected.sort(ascending);
  return collected.slice(-params.requiredBars);
}

/**
 * Read one forward page across the effective segments. `endAt` is inclusive;
 * `afterTimestamp` is exclusive. The returned cursor is the last bar timestamp
 * when the page is full, otherwise null.
 */
export async function readCanonicalPage(
  reader: CanonicalSegmentReader,
  segments: readonly ResolvedSegment[],
  params: CanonicalPageParams,
): Promise<CanonicalPage> {
  const endExclusive = new Date(params.endAt.getTime() + ONE_MILLISECOND);
  const bars: StrategyBar[] = [];
  let remaining = params.limit;
  let after = params.afterTimestamp ?? null;

  for (const segment of segments) {
    if (remaining === 0) break;

    const lower = maxDate(segment.from, params.startAt);
    const upper = minDate(segment.before, endExclusive);
    if (lower && upper && lower.getTime() >= upper.getTime()) continue;

    const page = await reader.read({
      securityId: params.securityId,
      source: segment.source,
      period: params.period,
      from: lower,
      before: upper,
      afterTimestamp: after,
      order: 'asc',
      limit: remaining,
    });

    if (page.length > 0) {
      bars.push(...page);
      remaining -= page.length;
      after = page[page.length - 1].timestamp;
    }
  }

  return {
    bars,
    nextAfterTimestamp:
      bars.length === params.limit ? bars[bars.length - 1].timestamp : null,
  };
}

/** Read the whole range by paging internally; bounded memory, ordered output. */
export async function readCanonicalRange(
  reader: CanonicalSegmentReader,
  segments: readonly ResolvedSegment[],
  params: CanonicalRangeParams,
): Promise<readonly StrategyBar[]> {
  const bars: StrategyBar[] = [];
  let after: Date | undefined;

  for (;;) {
    const page = await readCanonicalPage(reader, segments, {
      ...params,
      ...(after ? { afterTimestamp: after } : {}),
      limit: RANGE_PAGE_SIZE,
    });
    bars.push(...page.bars);
    if (!page.nextAfterTimestamp) break;
    after = page.nextAfterTimestamp;
  }

  return bars;
}
