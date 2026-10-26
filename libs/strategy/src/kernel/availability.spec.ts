import type { StrategyBar } from '@app/market-data';
import {
  availabilityKey,
  contextSeriesKey,
  isMissingContextSeriesError,
  MissingContextSeriesError,
  readContextSeries,
  SERIES_ATTRIBUTE_PREFIX,
} from './availability';

function bar(
  period: number,
  iso: string,
): Pick<StrategyBar, 'period' | 'timestamp'> {
  return { period, timestamp: new Date(iso) };
}

describe('availability key', () => {
  it('labels 1m bars one minute after their left bucket label', () => {
    expect(
      availabilityKey(bar(1, '2026-10-12T01:30:00.000Z')).toISOString(),
    ).toBe('2026-10-12T01:31:00.000Z');
  });

  it('keeps right-labeled intraday bars at their label', () => {
    expect(
      availabilityKey(bar(30, '2026-10-12T02:00:00.000Z')).toISOString(),
    ).toBe('2026-10-12T02:00:00.000Z');
    expect(
      availabilityKey(bar(5, '2026-10-12T01:55:00.000Z')).toISOString(),
    ).toBe('2026-10-12T01:55:00.000Z');
  });

  it('pushes session-terminal intraday bars one minute later', () => {
    // 11:30 上海 = 03:30 UTC；15:00 上海 = 07:00 UTC
    expect(
      availabilityKey(bar(30, '2026-10-12T03:30:00.000Z')).toISOString(),
    ).toBe('2026-10-12T03:31:00.000Z');
    expect(
      availabilityKey(bar(60, '2026-10-12T07:00:00.000Z')).toISOString(),
    ).toBe('2026-10-12T07:01:00.000Z');
  });

  it('maps the daily 00:00 identity to 15:01 of the same trading day', () => {
    // 2026-10-12 00:00 上海 = 2026-10-11 16:00 UTC
    expect(
      availabilityKey(bar(1440, '2026-10-11T16:00:00.000Z')).toISOString(),
    ).toBe('2026-10-12T07:01:00.000Z');
  });
});

describe('context series accessors', () => {
  it('builds the shared blackboard key', () => {
    expect(SERIES_ATTRIBUTE_PREFIX).toBe('series.');
    expect(contextSeriesKey(5)).toBe('series.5');
    expect(contextSeriesKey(1440)).toBe('series.1440');
  });

  it('reads injected series and returns undefined for missing keys', () => {
    const attributes = new Map<string, unknown>([
      ['series.5', [{ rawBar: { period: 5 } }]],
      ['garbage', 1],
    ]);
    expect(readContextSeries(attributes, 5)).toEqual([
      { rawBar: { period: 5 } },
    ]);
    expect(readContextSeries(attributes, 1440)).toBeUndefined();
    expect(readContextSeries(attributes, 30)).toBeUndefined();
  });

  it('recognizes missing-context errors across module boundaries', () => {
    const error = new MissingContextSeriesError(1440);
    expect(error.code).toBe('MISSING_CONTEXT_SERIES');
    expect(isMissingContextSeriesError(error)).toBe(true);
    expect(isMissingContextSeriesError(new Error('boom'))).toBe(false);
  });
});
