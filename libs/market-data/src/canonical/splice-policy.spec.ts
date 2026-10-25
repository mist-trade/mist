import { DataSource } from '@app/shared-data';
import {
  CanonicalDataError,
  assertSplicePolicy,
  clipSegments,
  resolveSegments,
  type ResolvedSegment,
  type SplicePolicy,
} from '../index';

const BEIJING = (date: string): Date => new Date(`${date}T00:00:00+08:00`);

const BASE_POLICY: SplicePolicy = {
  version: 'test-v1',
  defaults: {
    '5': [
      { source: DataSource.VENDOR_A, before: '2025-07-04' },
      { source: DataSource.QMT },
    ],
  },
};

describe('splice policy validation', () => {
  it('accepts a well-formed policy', () => {
    expect(() => assertSplicePolicy(BASE_POLICY)).not.toThrow();
  });

  it('rejects an empty segment list', () => {
    expect(() =>
      assertSplicePolicy({ version: 'v1', defaults: { '5': [] } }),
    ).toThrow(/at least one segment/);
  });

  it('rejects an unknown source', () => {
    expect(() =>
      assertSplicePolicy({
        version: 'v1',
        defaults: {
          '5': [{ source: 'mystery' as DataSource }],
        },
      }),
    ).toThrow(/not a known data source/);
  });

  it('rejects out-of-order segments', () => {
    expect(() =>
      assertSplicePolicy({
        version: 'v1',
        defaults: {
          '5': [
            {
              source: DataSource.QMT,
              from: '2025-07-04',
              before: '2025-08-01',
            },
            { source: DataSource.VENDOR_A, from: '2025-06-01' },
          ],
        },
      }),
    ).toThrow(/ordered by start time/);
  });

  it('rejects adjacent segments that both omit the shared boundary', () => {
    expect(() =>
      assertSplicePolicy({
        version: 'v1',
        defaults: {
          '5': [{ source: DataSource.VENDOR_A }, { source: DataSource.QMT }],
        },
      }),
    ).toThrow(/cannot omit/);
  });

  it('infers a middle segment boundary from its neighbours', () => {
    const policy: SplicePolicy = {
      version: 'v1',
      defaults: {
        '5': [
          { source: DataSource.VENDOR_A, before: '2025-07-04' },
          { source: DataSource.QMT },
        ],
      },
    };
    const segments = resolveSegments(policy, '000001', 5);
    expect(segments).toHaveLength(2);
    expect(segments[1].from?.getTime()).toBe(BEIJING('2025-07-04').getTime());
  });

  it('rejects an invalid period key', () => {
    expect(() =>
      assertSplicePolicy({
        version: 'v1',
        defaults: { abc: [{ source: DataSource.QMT }] },
      }),
    ).toThrow(/invalid period key/);
  });
});

describe('resolveSegments', () => {
  it('resolves defaults into dated segments', () => {
    const segments = resolveSegments(BASE_POLICY, '000001', 5);
    expect(segments).toHaveLength(2);
    expect(segments[0].source).toBe(DataSource.VENDOR_A);
    expect(segments[0].from).toBeNull();
    expect(segments[0].before?.getTime()).toBe(BEIJING('2025-07-04').getTime());
    expect(segments[1].source).toBe(DataSource.QMT);
    expect(segments[1].from?.getTime()).toBe(BEIJING('2025-07-04').getTime());
  });

  it('prefers a security override', () => {
    const policy: SplicePolicy = {
      ...BASE_POLICY,
      overrides: [
        {
          security: '000001',
          periods: { '5': [{ source: DataSource.QMT }] },
        },
      ],
    };
    const segments = resolveSegments(policy, '000001', 5);
    expect(segments).toHaveLength(1);
    expect(segments[0].source).toBe(DataSource.QMT);
  });

  it('fails explicitly when the period is not configured', () => {
    expect(() => resolveSegments(BASE_POLICY, '000001', 30)).toThrow(
      CanonicalDataError,
    );
    try {
      resolveSegments(BASE_POLICY, '000001', 30);
    } catch (error) {
      expect((error as CanonicalDataError).code).toBe(
        'CANONICAL_SEGMENT_UNRESOLVED',
      );
    }
  });
});

describe('clipSegments', () => {
  const seg = (
    source: DataSource,
    from: string | null,
    before: string | null,
  ): ResolvedSegment => ({
    source,
    from: from ? BEIJING(from) : null,
    before: before ? BEIJING(before) : null,
  });

  it('clips an overlapping later segment to the earlier boundary', () => {
    const clipped = clipSegments([
      seg(DataSource.VENDOR_A, null, '2025-07-04'),
      seg(DataSource.QMT, '2025-05-01', null),
    ]);
    expect(clipped).toHaveLength(2);
    expect(clipped[1].from?.getTime()).toBe(BEIJING('2025-07-04').getTime());
  });

  it('splits a later segment that spans an earlier one', () => {
    const clipped = clipSegments([
      seg(DataSource.TDX, '2018-01-01', '2020-01-01'),
      seg(DataSource.QMT, '2005-01-01', '2025-01-01'),
    ]);
    expect(clipped).toHaveLength(3);
    expect(clipped[1].from?.getTime()).toBe(BEIJING('2005-01-01').getTime());
    expect(clipped[1].before?.getTime()).toBe(BEIJING('2018-01-01').getTime());
    expect(clipped[2].from?.getTime()).toBe(BEIJING('2020-01-01').getTime());
    expect(clipped[2].before?.getTime()).toBe(BEIJING('2025-01-01').getTime());
  });

  it('drops a fully covered segment', () => {
    const clipped = clipSegments([
      seg(DataSource.TDX, null, null),
      seg(DataSource.QMT, '2020-01-01', '2021-01-01'),
    ]);
    expect(clipped).toHaveLength(1);
  });

  it('keeps disjoint segments untouched', () => {
    const clipped = clipSegments([
      seg(DataSource.VENDOR_A, null, '2025-07-04'),
      seg(DataSource.QMT, '2025-07-04', null),
    ]);
    expect(clipped).toHaveLength(2);
  });
});
