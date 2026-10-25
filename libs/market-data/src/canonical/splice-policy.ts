import { DataSource } from '@app/shared-data';
import {
  CanonicalDataError,
  type ResolvedSegment,
  type SplicePolicy,
  type SpliceSegment,
} from './splice-policy.types';

const POLICY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BEIJING_MIDNIGHT_SUFFIX = 'T00:00:00+08:00';
const DEFAULTS_PATH = 'defaults';

const KNOWN_SOURCES = new Set<string>(Object.values(DataSource));

function parsePolicyDate(value: string, field: string): Date {
  if (!POLICY_DATE_PATTERN.test(value)) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${field} must use YYYY-MM-DD, received "${value}"`,
    );
  }
  const parsed = new Date(`${value}${BEIJING_MIDNIGHT_SUFFIX}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${field} is not a valid date: "${value}"`,
    );
  }
  return parsed;
}

function assertSegment(segment: SpliceSegment, path: string): void {
  if (!KNOWN_SOURCES.has(segment.source)) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${path}.source is not a known data source: "${String(segment.source)}"`,
    );
  }
  const from = segment.from
    ? parsePolicyDate(segment.from, `${path}.from`)
    : null;
  const before = segment.before
    ? parsePolicyDate(segment.before, `${path}.before`)
    : null;
  if (from && before && from.getTime() >= before.getTime()) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${path}.from must be earlier than ${path}.before`,
    );
  }
}

function effectiveFrom(
  segments: readonly SpliceSegment[],
  index: number,
  path: string,
): Date | null {
  const segment = segments[index];
  if (segment.from)
    return parsePolicyDate(segment.from, `${path}[${index}].from`);
  if (index === 0) return null;
  const previous = segments[index - 1];
  if (!previous.before) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${path}[${index}] cannot omit "from" while ${path}[${index - 1}] omits "before"`,
    );
  }
  return parsePolicyDate(previous.before, `${path}[${index - 1}].before`);
}

function effectiveBefore(
  segments: readonly SpliceSegment[],
  index: number,
  path: string,
): Date | null {
  const segment = segments[index];
  if (segment.before)
    return parsePolicyDate(segment.before, `${path}[${index}].before`);
  if (index === segments.length - 1) return null;
  const next = segments[index + 1];
  if (!next.from) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${path}[${index}] cannot omit "before" while ${path}[${index + 1}] omits "from"`,
    );
  }
  return parsePolicyDate(next.from, `${path}[${index + 1}].from`);
}

function assertSegmentList(
  segments: readonly SpliceSegment[],
  path: string,
): void {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      `${path} must contain at least one segment`,
    );
  }
  let previousStart: Date | null = null;
  segments.forEach((segment, index) => {
    assertSegment(segment, `${path}[${index}]`);
    const from = effectiveFrom(segments, index, path);
    const before = effectiveBefore(segments, index, path);
    if (from && before && from.getTime() >= before.getTime()) {
      throw new CanonicalDataError(
        'CANONICAL_POLICY_INVALID',
        `${path}[${index}] resolves to an empty or inverted range`,
      );
    }
    if (from && previousStart && from.getTime() < previousStart.getTime()) {
      throw new CanonicalDataError(
        'CANONICAL_POLICY_INVALID',
        `${path} segments must be ordered by start time`,
      );
    }
    if (from) previousStart = from;
  });
}

function assertPeriodMap(
  periods: Readonly<Record<string, readonly SpliceSegment[]>>,
  path: string,
): void {
  for (const [period, segments] of Object.entries(periods)) {
    if (!/^\d+$/.test(period) || Number(period) <= 0) {
      throw new CanonicalDataError(
        'CANONICAL_POLICY_INVALID',
        `${path} has an invalid period key "${period}"`,
      );
    }
    assertSegmentList(segments, `${path}.${period}`);
  }
}

/** Structural + semantic validation; throws CANONICAL_POLICY_INVALID. */
export function assertSplicePolicy(policy: SplicePolicy): void {
  if (!policy || typeof policy !== 'object') {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      'policy must be an object',
    );
  }
  if (
    typeof policy.version !== 'string' ||
    policy.version.trim().length === 0
  ) {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      'policy.version must be a non-empty string',
    );
  }
  if (!policy.defaults || typeof policy.defaults !== 'object') {
    throw new CanonicalDataError(
      'CANONICAL_POLICY_INVALID',
      'policy.defaults must be an object keyed by period',
    );
  }
  assertPeriodMap(policy.defaults, DEFAULTS_PATH);
  for (const [index, override] of (policy.overrides ?? []).entries()) {
    if (
      typeof override.security !== 'string' ||
      override.security.length === 0
    ) {
      throw new CanonicalDataError(
        'CANONICAL_POLICY_INVALID',
        `overrides[${index}].security must be a non-empty string`,
      );
    }
    assertPeriodMap(override.periods, `overrides[${index}].periods`);
  }
}

const MIN_TIME = Number.NEGATIVE_INFINITY;
const MAX_TIME = Number.POSITIVE_INFINITY;

function lowerBound(segment: ResolvedSegment): number {
  return segment.from ? segment.from.getTime() : MIN_TIME;
}

function upperBound(segment: ResolvedSegment): number {
  return segment.before ? segment.before.getTime() : MAX_TIME;
}

function toDateOrNull(value: number): Date | null {
  if (value === MIN_TIME || value === MAX_TIME) return null;
  return new Date(value);
}

/**
 * Resolve overlapping segments into disjoint effective intervals.
 * Earlier segments win; a later segment may be split into several intervals
 * when earlier segments cover parts of its range.
 */
export function clipSegments(
  segments: readonly ResolvedSegment[],
): readonly ResolvedSegment[] {
  const covered: Array<{ from: number; before: number }> = [];
  const result: ResolvedSegment[] = [];

  for (const segment of segments) {
    let pieces: Array<{ from: number; before: number }> = [
      { from: lowerBound(segment), before: upperBound(segment) },
    ];

    for (const cover of covered) {
      const next: Array<{ from: number; before: number }> = [];
      for (const piece of pieces) {
        if (cover.before <= piece.from || cover.from >= piece.before) {
          next.push(piece);
          continue;
        }
        if (piece.from < cover.from) {
          next.push({ from: piece.from, before: cover.from });
        }
        if (cover.before < piece.before) {
          next.push({ from: cover.before, before: piece.before });
        }
      }
      pieces = next;
    }

    for (const piece of pieces) {
      if (piece.from < piece.before) {
        result.push({
          source: segment.source,
          from: toDateOrNull(piece.from),
          before: toDateOrNull(piece.before),
        });
      }
    }

    covered.push({
      from: lowerBound(segment),
      before: upperBound(segment),
    });
  }

  return result;
}

/**
 * Resolve the effective, disjoint segment list for a security and period.
 * Overrides win over defaults; missing configuration fails explicitly.
 */
export function resolveSegments(
  policy: SplicePolicy,
  securityCode: string,
  period: number,
): readonly ResolvedSegment[] {
  assertSplicePolicy(policy);

  const key = String(period);
  const override = policy.overrides?.find(
    (candidate) => candidate.security === securityCode,
  );
  const fromOverride = override?.periods[key];
  const fromDefaults = policy.defaults[key];
  const selected = fromOverride ?? fromDefaults;

  if (!selected || selected.length === 0) {
    throw new CanonicalDataError(
      'CANONICAL_SEGMENT_UNRESOLVED',
      `no splice segments configured for ${securityCode} period ${period}`,
    );
  }

  const path = fromOverride
    ? `overrides[${securityCode}].${key}`
    : `defaults.${key}`;
  const resolved = selected.map((segment, index) => ({
    source: segment.source,
    from: effectiveFrom(selected, index, path),
    before: effectiveBefore(selected, index, path),
  }));
  return clipSegments(resolved);
}
