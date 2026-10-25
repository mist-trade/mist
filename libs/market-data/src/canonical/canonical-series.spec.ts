import { DataSource } from '@app/shared-data';
import {
  loadCanonicalWindow,
  readCanonicalPage,
  readCanonicalRange,
  resolveSegments,
  type CanonicalSegmentReader,
  type SplicePolicy,
  type StrategyBar,
} from '../index';

const POLICY: SplicePolicy = {
  version: 'test-v1',
  defaults: {
    '5': [
      { source: DataSource.VENDOR_A, before: '2025-07-04' },
      { source: DataSource.QMT },
    ],
  },
};

function bar(source: DataSource, iso: string): StrategyBar {
  return {
    securityId: 5,
    securityCode: '000001',
    source: source as StrategyBar['source'],
    period: 5,
    timestamp: new Date(iso),
    open: 100,
    high: 101,
    low: 99,
    close: 100.5,
    volume: '1000',
    amount: '100000',
    type: 'complete',
  };
}

function makeReader(
  rows: Partial<Record<DataSource, readonly StrategyBar[]>>,
): CanonicalSegmentReader {
  return {
    async read(params) {
      const values = (rows[params.source] ?? []).filter((candidate) => {
        const time = candidate.timestamp.getTime();
        if (params.from && time < params.from.getTime()) return false;
        if (params.before && time >= params.before.getTime()) return false;
        if (params.afterTimestamp && time <= params.afterTimestamp.getTime()) {
          return false;
        }
        return true;
      });
      const sorted = [...values].sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
      if (params.order === 'desc') sorted.reverse();
      return sorted.slice(0, params.limit);
    },
  };
}

const VENDOR_ROWS = [
  bar(DataSource.VENDOR_A, '2025-07-01T10:00:00+08:00'),
  bar(DataSource.VENDOR_A, '2025-07-02T10:00:00+08:00'),
  bar(DataSource.VENDOR_A, '2025-07-03T10:00:00+08:00'),
];
const QMT_ROWS = [
  bar(DataSource.QMT, '2025-07-04T10:00:00+08:00'),
  bar(DataSource.QMT, '2025-07-07T10:00:00+08:00'),
];

describe('loadCanonicalWindow', () => {
  it('walks segments backwards and returns ascending bars', async () => {
    const segments = resolveSegments(POLICY, '000001', 5);
    const bars = await loadCanonicalWindow(
      makeReader({
        [DataSource.VENDOR_A]: VENDOR_ROWS,
        [DataSource.QMT]: QMT_ROWS,
      }),
      segments,
      {
        securityId: 5,
        period: 5,
        endAt: new Date('2025-07-08T00:00:00+08:00'),
        requiredBars: 4,
      },
    );

    expect(bars.map((item) => item.timestamp.toISOString())).toEqual([
      '2025-07-02T02:00:00.000Z',
      '2025-07-03T02:00:00.000Z',
      '2025-07-04T02:00:00.000Z',
      '2025-07-07T02:00:00.000Z',
    ]);
  });

  it('uses only the last segment when it already satisfies the window', async () => {
    const segments = resolveSegments(POLICY, '000001', 5);
    const bars = await loadCanonicalWindow(
      makeReader({
        [DataSource.VENDOR_A]: VENDOR_ROWS,
        [DataSource.QMT]: QMT_ROWS,
      }),
      segments,
      {
        securityId: 5,
        period: 5,
        endAt: new Date('2025-07-08T00:00:00+08:00'),
        requiredBars: 2,
      },
    );

    expect(bars.map((item) => item.timestamp.toISOString())).toEqual([
      '2025-07-04T02:00:00.000Z',
      '2025-07-07T02:00:00.000Z',
    ]);
  });
});

describe('readCanonicalPage', () => {
  it('crosses a segment boundary without duplicating bars', async () => {
    const segments = resolveSegments(POLICY, '000001', 5);
    const reader = makeReader({
      [DataSource.VENDOR_A]: VENDOR_ROWS,
      [DataSource.QMT]: QMT_ROWS,
    });

    const first = await readCanonicalPage(reader, segments, {
      securityId: 5,
      period: 5,
      startAt: new Date('2025-07-01T00:00:00+08:00'),
      endAt: new Date('2025-07-07T23:59:59+08:00'),
      limit: 3,
    });
    expect(first.bars).toHaveLength(3);
    expect(first.nextAfterTimestamp?.toISOString()).toBe(
      '2025-07-03T02:00:00.000Z',
    );

    const second = await readCanonicalPage(reader, segments, {
      securityId: 5,
      period: 5,
      startAt: new Date('2025-07-01T00:00:00+08:00'),
      endAt: new Date('2025-07-07T23:59:59+08:00'),
      afterTimestamp: first.nextAfterTimestamp ?? undefined,
      limit: 3,
    });

    expect(second.bars.map((item) => item.timestamp.toISOString())).toEqual([
      '2025-07-04T02:00:00.000Z',
      '2025-07-07T02:00:00.000Z',
    ]);
    expect(second.nextAfterTimestamp).toBeNull();
  });

  it('keeps a real gap empty instead of filling it', async () => {
    const segments = resolveSegments(POLICY, '000001', 5);
    const reader = makeReader({
      [DataSource.VENDOR_A]: VENDOR_ROWS,
      [DataSource.QMT]: [bar(DataSource.QMT, '2025-07-10T10:00:00+08:00')],
    });

    const page = await readCanonicalPage(reader, segments, {
      securityId: 5,
      period: 5,
      startAt: new Date('2025-07-01T00:00:00+08:00'),
      endAt: new Date('2025-07-12T23:59:59+08:00'),
      limit: 100,
    });

    expect(page.bars.map((item) => item.timestamp.toISOString())).toEqual([
      '2025-07-01T02:00:00.000Z',
      '2025-07-02T02:00:00.000Z',
      '2025-07-03T02:00:00.000Z',
      '2025-07-10T02:00:00.000Z',
    ]);
  });
});

describe('readCanonicalRange', () => {
  it('reads the whole range in order', async () => {
    const segments = resolveSegments(POLICY, '000001', 5);
    const bars = await readCanonicalRange(
      makeReader({
        [DataSource.VENDOR_A]: VENDOR_ROWS,
        [DataSource.QMT]: QMT_ROWS,
      }),
      segments,
      {
        securityId: 5,
        period: 5,
        startAt: new Date('2025-07-01T00:00:00+08:00'),
        endAt: new Date('2025-07-07T23:59:59+08:00'),
      },
    );

    expect(bars).toHaveLength(5);
  });

  it('pages internally beyond one thousand bars', async () => {
    const rows: StrategyBar[] = [];
    for (let index = 0; index < 1005; index += 1) {
      const minutes = index;
      const timestamp = new Date(
        Date.UTC(2025, 6, 1, 1, 0, 0) + minutes * 60_000,
      );
      rows.push({
        ...bar(DataSource.QMT, timestamp.toISOString()),
      });
    }
    const policy: SplicePolicy = {
      version: 'v1',
      defaults: { '1': [{ source: DataSource.QMT }] },
    };
    const segments = resolveSegments(policy, '000001', 1);
    const bars = await readCanonicalRange(
      makeReader({ [DataSource.QMT]: rows }),
      segments,
      {
        securityId: 5,
        period: 1,
        startAt: new Date('2025-07-01T00:00:00Z'),
        endAt: new Date('2025-07-03T00:00:00Z'),
      },
    );

    expect(bars).toHaveLength(1005);
    expect(bars[0].timestamp.getTime()).toBeLessThan(
      bars[bars.length - 1].timestamp.getTime(),
    );
  });
});
