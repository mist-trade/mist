import {
  VENDOR_A_QUALITY_PROFILES,
  VendorImportError,
  aggregateSessionThirtyMinute,
  assertVendorSeries,
  buildVendorImport,
  parseVendorCsv,
  resolveQuality,
  type QualitySegment,
  type VendorCsvRow,
} from '../index';

const HEADER =
  'datetime,open,high,low,close,volume,amount,volume_quality,manual_fix,quality';

function csvLine(
  datetime: string,
  price = 100,
  volume = 1000,
  amount = 100000,
  volumeQuality = 'ok',
  manualFix = '0',
  quality = 'ok',
): string {
  const open = price;
  const close = price + 1;
  const high = price + 2;
  const low = price - 2;
  return `${datetime},${open},${high},${low},${close},${volume},${amount},${volumeQuality},${manualFix},${quality}`;
}

function row(
  timestamp: string,
  overrides: Partial<VendorCsvRow> = {},
): VendorCsvRow {
  return {
    timestamp: new Date(timestamp.replace(' ', 'T')),
    open: 100,
    high: 102,
    low: 98,
    close: 101,
    volume: 1000,
    amount: 100000,
    volumeQuality: 'ok',
    manualFix: false,
    quality: 'ok',
    ...overrides,
  };
}

/** Build 48 five-minute bars for one trading day, bar-end labelled. */
function fullDay(day: string): VendorCsvRow[] {
  const minutes: number[] = [];
  for (let minute = 9 * 60 + 35; minute <= 11 * 60 + 30; minute += 5) {
    minutes.push(minute);
  }
  for (let minute = 13 * 60 + 5; minute <= 15 * 60; minute += 5) {
    minutes.push(minute);
  }
  return minutes.map((minute) => {
    const hour = `${Math.floor(minute / 60)}`.padStart(2, '0');
    const rest = `${minute % 60}`.padStart(2, '0');
    return row(`${day} ${hour}:${rest}:00`);
  });
}

describe('parseVendorCsv', () => {
  it('parses a BOM-prefixed vendor csv with the expected columns', () => {
    const text = `\uFEFF${HEADER}\n${csvLine('2026-09-30 09:35:00')}\n`;
    const rows = parseVendorCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].timestamp).toEqual(new Date('2026-09-30T09:35:00'));
    expect(rows[0].quality).toBe('ok');
    expect(rows[0].manualFix).toBe(false);
  });

  it('rejects an unexpected header', () => {
    expect(() =>
      parseVendorCsv(
        'datetime,open,high,low,close\n2026-09-30 09:35:00,1,2,0.5,1\n',
      ),
    ).toThrow(VendorImportError);
  });

  it('rejects an invalid datetime and invalid numbers', () => {
    expect(() =>
      parseVendorCsv(`${HEADER}\n2026/09/30 09:35,100,102,98,101,1,1,ok,0,ok`),
    ).toThrow(/invalid datetime/);
    expect(() =>
      parseVendorCsv(
        `${HEADER}\n2026-09-30 09:35:00,abc,102,98,101,1,1,ok,0,ok`,
      ),
    ).toThrow(/invalid open/);
  });
});

describe('assertVendorSeries', () => {
  it('accepts a normal series and reports the per-day distribution', () => {
    const rows = fullDay('2026-09-30');
    const distribution = assertVendorSeries(rows, {
      expectedBarsPerDay: [48],
    });
    expect(distribution.get(48)).toBe(1);
  });

  it('rejects out-of-order timestamps', () => {
    expect(() =>
      assertVendorSeries([
        row('2026-09-30 09:40:00'),
        row('2026-09-30 09:35:00'),
      ]),
    ).toThrow(/strictly increasing/);
  });

  it('rejects OHLC envelope violations and negative quantity', () => {
    expect(() =>
      assertVendorSeries([row('2026-09-30 09:35:00', { high: 99 })]),
    ).toThrow(/high below/);
    expect(() =>
      assertVendorSeries([row('2026-09-30 09:35:00', { low: 103 })]),
    ).toThrow(/low above/);
    expect(() =>
      assertVendorSeries([row('2026-09-30 09:35:00', { volume: -1 })]),
    ).toThrow(/negative quantity/);
  });

  it('rejects an unexpected bars-per-day count', () => {
    expect(() =>
      assertVendorSeries([row('2026-09-30 09:35:00')], {
        expectedBarsPerDay: [48],
      }),
    ).toThrow(/unexpected bars-per-day/);
  });
});

describe('resolveQuality', () => {
  it('defaults to fully usable in epoch 1', () => {
    expect(resolveQuality(new Date('2026-09-30T09:35:00'), [])).toEqual({
      openValid: 1,
      highValid: 1,
      lowValid: 1,
      closeValid: 1,
      volumeValid: 1,
      amountValid: 1,
      volumeScale: 1,
      amountScale: 1,
      caliberEpoch: 1,
      manualFix: 0,
    });
  });

  it('applies date ranges inclusively and lets later segments override', () => {
    const segments: QualitySegment[] = [
      { from: '2005-01-04', to: '2011-07-26', volumeValid: 0, amountValid: 0 },
      { from: '2011-07-27', volumeValid: 1, amountValid: 1, caliberEpoch: 2 },
    ];
    expect(
      resolveQuality(new Date('2011-07-26T09:35:00'), segments).volumeValid,
    ).toBe(0);
    expect(
      resolveQuality(new Date('2011-07-27T09:35:00'), segments),
    ).toMatchObject({
      volumeValid: 1,
      amountValid: 1,
      caliberEpoch: 2,
    });
  });

  it('invalidates only high/low on the four known 000300 days', () => {
    const segments = VENDOR_A_QUALITY_PROFILES['000300'];
    expect(
      resolveQuality(new Date('2006-08-21T10:00:00'), segments),
    ).toMatchObject({
      openValid: 1,
      highValid: 0,
      lowValid: 0,
      closeValid: 1,
    });
    expect(
      resolveQuality(new Date('2006-08-22T10:00:00'), segments),
    ).toMatchObject({
      highValid: 1,
      lowValid: 1,
    });
  });
});

describe('aggregateSessionThirtyMinute', () => {
  it('aggregates a full day into the eight session-anchored bars', () => {
    const bars = aggregateSessionThirtyMinute(fullDay('2026-09-30'), []);
    expect(bars).toHaveLength(8);
    expect(
      bars.map(
        (bar) => bar.timestamp.getHours() * 60 + bar.timestamp.getMinutes(),
      ),
    ).toEqual([600, 630, 660, 690, 810, 840, 870, 900]);
    expect(bars[0].open).toBe(100);
    expect(bars[0].high).toBe(102);
    expect(bars[0].low).toBe(98);
    expect(bars[0].close).toBe(101);
    expect(bars[0].volume).toBe(6000);
    expect(bars[0].amount).toBe(600000);
  });

  it('keeps a truncated circuit-breaker day as real groups', () => {
    const rows: VendorCsvRow[] = [];
    for (let minute = 9 * 60 + 35; minute <= 11 * 60 + 30; minute += 5) {
      const hour = `${Math.floor(minute / 60)}`.padStart(2, '0');
      const rest = `${minute % 60}`.padStart(2, '0');
      rows.push(row(`2016-01-04 ${hour}:${rest}:00`));
    }
    for (let minute = 13 * 60 + 5; minute <= 13 * 60 + 35; minute += 5) {
      const hour = `${Math.floor(minute / 60)}`.padStart(2, '0');
      const rest = `${minute % 60}`.padStart(2, '0');
      rows.push(row(`2016-01-04 ${hour}:${rest}:00`));
    }

    const bars = aggregateSessionThirtyMinute(rows, []);
    expect(bars).toHaveLength(6);
    expect(bars[bars.length - 1].timestamp).toEqual(
      new Date('2016-01-04T13:35:00'),
    );
    expect(bars[bars.length - 1].volume).toBe(1000);
  });

  it('emits a single bar for a six-bar half day', () => {
    const rows = [
      9 * 60 + 35,
      9 * 60 + 40,
      9 * 60 + 45,
      9 * 60 + 50,
      9 * 60 + 55,
      10 * 60,
    ].map((minute) => {
      const hour = `${Math.floor(minute / 60)}`.padStart(2, '0');
      const rest = `${minute % 60}`.padStart(2, '0');
      return row(`2016-01-07 ${hour}:${rest}:00`);
    });
    const bars = aggregateSessionThirtyMinute(rows, []);
    expect(bars).toHaveLength(1);
    expect(bars[0].timestamp).toEqual(new Date('2016-01-07T10:00:00'));
  });

  it('ANDs validity flags and ORs manual fix', () => {
    const rows = fullDay('2026-09-30');
    const segments: QualitySegment[] = [
      { from: '2026-09-30', to: '2026-09-30', highValid: 0 },
    ];
    const withFix = rows.map((item, index) => ({
      ...item,
      manualFix: index === 0,
    }));
    const bars = aggregateSessionThirtyMinute(withFix, segments);
    expect(bars[0].quality.highValid).toBe(0);
    expect(bars[0].quality.lowValid).toBe(1);
    expect(bars[0].quality.manualFix).toBe(1);
    expect(bars[1].quality.manualFix).toBe(0);
  });

  it('keeps one caliber epoch for every bar of a day', () => {
    const rows = fullDay('2026-09-30');
    const days = aggregateSessionThirtyMinute(rows, [
      { from: '2000-01-01', caliberEpoch: 3 },
    ]);
    expect(new Set(days.map((bar) => bar.quality.caliberEpoch))).toEqual(
      new Set([3]),
    );
  });
});

describe('buildVendorImport', () => {
  it('builds both periods with quality rows', () => {
    const bundle = buildVendorImport(fullDay('2026-09-30'), {
      securityId: 5,
      datasetVersion: 'test@v1',
      segments: [],
    });
    expect(bundle.fiveMinute.bars).toHaveLength(48);
    expect(bundle.fiveMinute.qualities).toHaveLength(48);
    expect(bundle.thirtyMinute.bars).toHaveLength(8);
    expect(bundle.thirtyMinute.qualities).toHaveLength(8);
    expect(bundle.fiveMinute.qualities[0].derivedFromPeriod).toBeNull();
    expect(bundle.thirtyMinute.qualities[0].derivedFromPeriod).toBe(5);
    expect(bundle.thirtyMinute.qualities[0].datasetVersion).toBe('test@v1');
  });

  it('propagates manual_fix into the five-minute quality row', () => {
    const rows = fullDay('2026-09-30').map((item, index) => ({
      ...item,
      manualFix: index === 3,
    }));
    const bundle = buildVendorImport(rows, {
      securityId: 5,
      datasetVersion: 'test@v1',
      segments: [],
    });
    expect(bundle.fiveMinute.qualities[3].quality.manualFix).toBe(1);
  });

  it('requires an explicit segment for a bar flagged bad', () => {
    const rows = [row('2026-09-30 09:35:00', { quality: 'bad' })];
    expect(() =>
      buildVendorImport(rows, {
        securityId: 5,
        datasetVersion: 'test@v1',
        segments: [],
      }),
    ).toThrow(/flagged bad is fully valid/);
  });
});
