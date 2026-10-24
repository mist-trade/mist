/**
 * Third-party (vendor) CSV → canonical bar/quality rows.
 *
 * Pure functions only: no file system, no network, no Date.now(). The caller
 * owns IO and reporting. The resulting rows are written into `k` plus the
 * numeric `k_quality` contract.
 */

export const VENDOR_CSV_COLUMNS = [
  'datetime',
  'open',
  'high',
  'low',
  'close',
  'volume',
  'amount',
  'volume_quality',
  'manual_fix',
  'quality',
] as const;

/** Session anchors in Beijing wall-clock minutes (bar-end labelled). */
const MINUTES_PER_HOUR = 60;
const MORNING_END_MINUTE = 11 * MINUTES_PER_HOUR + 30;
const BARS_PER_THIRTY_MINUTE = 6;
const FIVE_MINUTE_PERIOD = 5;
const THIRTY_MINUTE_PERIOD = 30;
const BAD_QUALITY = 'bad';
const DEFAULT_QUALITY_TEXT = 'ok';
const MANUAL_FIX_FLAG = '1';
const CSV_FIELD = {
  OPEN: 'open',
  HIGH: 'high',
  LOW: 'low',
  CLOSE: 'close',
  VOLUME: 'volume',
  AMOUNT: 'amount',
} as const;
const VALIDITY_FIELDS = [
  'openValid',
  'highValid',
  'lowValid',
  'closeValid',
  'volumeValid',
  'amountValid',
] as const;
type ValidityField = (typeof VALIDITY_FIELDS)[number];

export interface VendorCsvRow {
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount: number;
  /** Provider's own caliber vocabulary; kept for reporting, never persisted as text. */
  readonly volumeQuality: string;
  readonly manualFix: boolean;
  readonly quality: string;
}

export type ValidityFlag = 0 | 1;

export interface BarQuality {
  readonly openValid: ValidityFlag;
  readonly highValid: ValidityFlag;
  readonly lowValid: ValidityFlag;
  readonly closeValid: ValidityFlag;
  readonly volumeValid: ValidityFlag;
  readonly amountValid: ValidityFlag;
  readonly volumeScale: number;
  readonly amountScale: number;
  readonly caliberEpoch: number;
  readonly manualFix: ValidityFlag;
}

/**
 * A date-ranged quality override. Matching segments are applied in array order,
 * so a later segment wins for every field it declares. Fields it omits keep the
 * value from earlier segments (or the "fully usable" default).
 */
export interface QualitySegment {
  /** Inclusive start date, `YYYY-MM-DD`. */
  readonly from: string;
  /** Inclusive end date, `YYYY-MM-DD`. Omit for open-ended. */
  readonly to?: string;
  readonly openValid?: ValidityFlag;
  readonly highValid?: ValidityFlag;
  readonly lowValid?: ValidityFlag;
  readonly closeValid?: ValidityFlag;
  readonly volumeValid?: ValidityFlag;
  readonly amountValid?: ValidityFlag;
  readonly volumeScale?: number;
  readonly amountScale?: number;
  readonly caliberEpoch?: number;
}

export interface VendorKRow {
  readonly securityId: number;
  readonly period: number;
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount: number;
}

export interface VendorQualityRow {
  readonly securityId: number;
  readonly period: number;
  readonly timestamp: Date;
  readonly quality: BarQuality;
  readonly derivedFromPeriod: number | null;
  readonly datasetVersion: string;
}

export interface VendorImportBundle {
  readonly fiveMinute: {
    readonly bars: readonly VendorKRow[];
    readonly qualities: readonly VendorQualityRow[];
  };
  readonly thirtyMinute: {
    readonly bars: readonly VendorKRow[];
    readonly qualities: readonly VendorQualityRow[];
  };
}

export class VendorImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendorImportError';
  }
}

const DEFAULT_QUALITY: BarQuality = {
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
};

function toIsoDate(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = `${timestamp.getMonth() + 1}`.padStart(2, '0');
  const day = `${timestamp.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toMinuteOfDay(timestamp: Date): number {
  return timestamp.getHours() * MINUTES_PER_HOUR + timestamp.getMinutes();
}

/**
 * Parse the vendor CSV (utf-8 with BOM, comma separated, 10 columns).
 * Timestamps are Beijing wall clock and stay as local `Date` parts.
 */
export function parseVendorCsv(text: string): VendorCsvRow[] {
  const normalized = text.replace(/^\uFEFF/, '');
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new VendorImportError('vendor csv is empty');
  }

  const header = lines[0].split(',').map((cell) => cell.trim());
  if (
    header.length !== VENDOR_CSV_COLUMNS.length ||
    header.some((cell, index) => cell !== VENDOR_CSV_COLUMNS[index])
  ) {
    throw new VendorImportError(
      `unexpected vendor csv header: ${header.join(',')}`,
    );
  }

  const rows: VendorCsvRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index].split(',');
    if (cells.length !== VENDOR_CSV_COLUMNS.length) {
      throw new VendorImportError(
        `line ${index + 1}: expected ${VENDOR_CSV_COLUMNS.length} columns, got ${cells.length}`,
      );
    }
    rows.push(parseVendorCsvRow(cells, index + 1));
  }

  return rows;
}

function parseVendorCsvRow(cells: string[], lineNumber: number): VendorCsvRow {
  const [
    datetime,
    open,
    high,
    low,
    close,
    volume,
    amount,
    volumeQuality,
    manualFix,
    quality,
  ] = cells.map((cell) => cell.trim());

  const timestamp = parseVendorTimestamp(datetime, lineNumber);
  return {
    timestamp,
    open: parseNumber(open, CSV_FIELD.OPEN, lineNumber),
    high: parseNumber(high, CSV_FIELD.HIGH, lineNumber),
    low: parseNumber(low, CSV_FIELD.LOW, lineNumber),
    close: parseNumber(close, CSV_FIELD.CLOSE, lineNumber),
    volume: parseNumber(volume, CSV_FIELD.VOLUME, lineNumber),
    amount: parseNumber(amount, CSV_FIELD.AMOUNT, lineNumber),
    volumeQuality: volumeQuality || DEFAULT_QUALITY_TEXT,
    manualFix: manualFix === MANUAL_FIX_FLAG,
    quality: quality || DEFAULT_QUALITY_TEXT,
  };
}

function parseVendorTimestamp(value: string, lineNumber: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new VendorImportError(
      `line ${lineNumber}: invalid datetime "${value}", expected YYYY-MM-DD HH:mm:ss`,
    );
  }
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  if (Number.isNaN(parsed.getTime())) {
    throw new VendorImportError(
      `line ${lineNumber}: invalid datetime "${value}"`,
    );
  }
  return parsed;
}

function parseNumber(value: string, field: string, lineNumber: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new VendorImportError(
      `line ${lineNumber}: invalid ${field} value "${value}"`,
    );
  }
  return parsed;
}

export interface VendorSeriesValidationOptions {
  /** Allowed bar counts per trading day. Omit to skip the distribution gate. */
  readonly expectedBarsPerDay?: readonly number[];
}

/**
 * Fail-closed series validation. Returns the per-day bar-count distribution so
 * the caller can print it in the import manifest.
 */
export function assertVendorSeries(
  rows: readonly VendorCsvRow[],
  options: VendorSeriesValidationOptions = {},
): Map<number, number> {
  if (rows.length === 0) {
    throw new VendorImportError('vendor series is empty');
  }

  let previous = Number.NEGATIVE_INFINITY;
  const barsPerDay = new Map<string, number>();

  for (const row of rows) {
    const stamp = row.timestamp.getTime();
    if (stamp <= previous) {
      throw new VendorImportError(
        `timestamps are not strictly increasing at ${row.timestamp.toISOString()}`,
      );
    }
    previous = stamp;

    if (row.open <= 0 || row.high <= 0 || row.low <= 0 || row.close <= 0) {
      throw new VendorImportError(
        `non-positive price at ${row.timestamp.toISOString()}`,
      );
    }
    if (row.high < Math.max(row.open, row.close)) {
      throw new VendorImportError(
        `high below open/close at ${row.timestamp.toISOString()}`,
      );
    }
    if (row.low > Math.min(row.open, row.close)) {
      throw new VendorImportError(
        `low above open/close at ${row.timestamp.toISOString()}`,
      );
    }
    if (row.high < row.low) {
      throw new VendorImportError(
        `high below low at ${row.timestamp.toISOString()}`,
      );
    }
    if (row.volume < 0 || row.amount < 0) {
      throw new VendorImportError(
        `negative quantity at ${row.timestamp.toISOString()}`,
      );
    }

    const day = toIsoDate(row.timestamp);
    barsPerDay.set(day, (barsPerDay.get(day) ?? 0) + 1);
  }

  const distribution = new Map<number, number>();
  for (const count of barsPerDay.values()) {
    distribution.set(count, (distribution.get(count) ?? 0) + 1);
  }

  if (options.expectedBarsPerDay) {
    const allowed = new Set(options.expectedBarsPerDay);
    for (const count of distribution.keys()) {
      if (!allowed.has(count)) {
        throw new VendorImportError(
          `unexpected bars-per-day count ${count}; allowed ${[...allowed].join(',')}`,
        );
      }
    }
  }

  return distribution;
}

/**
 * Resolve a bar's numeric quality from the provider segments. Later matching
 * segments override earlier ones field by field.
 */
export function resolveQuality(
  timestamp: Date,
  segments: readonly QualitySegment[],
): BarQuality {
  const day = toIsoDate(timestamp);
  let resolved = DEFAULT_QUALITY;

  for (const segment of segments) {
    if (day < segment.from) continue;
    if (segment.to && day > segment.to) continue;
    resolved = {
      openValid: segment.openValid ?? resolved.openValid,
      highValid: segment.highValid ?? resolved.highValid,
      lowValid: segment.lowValid ?? resolved.lowValid,
      closeValid: segment.closeValid ?? resolved.closeValid,
      volumeValid: segment.volumeValid ?? resolved.volumeValid,
      amountValid: segment.amountValid ?? resolved.amountValid,
      volumeScale: segment.volumeScale ?? resolved.volumeScale,
      amountScale: segment.amountScale ?? resolved.amountScale,
      caliberEpoch: segment.caliberEpoch ?? resolved.caliberEpoch,
      manualFix: resolved.manualFix,
    };
  }

  return resolved;
}

interface GroupedBar {
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount: number;
  readonly quality: BarQuality;
}

/**
 * Aggregate 5-minute rows into 30-minute bars by chunking each trading session
 * into ordered groups of six. Truncated sessions keep their real final group.
 */
export function aggregateSessionThirtyMinute(
  rows: readonly VendorCsvRow[],
  segments: readonly QualitySegment[],
): GroupedBar[] {
  const byDay = new Map<string, VendorCsvRow[]>();
  for (const row of rows) {
    const day = toIsoDate(row.timestamp);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(row);
    else byDay.set(day, [row]);
  }

  const result: GroupedBar[] = [];
  for (const dayRows of byDay.values()) {
    const morning = dayRows.filter(
      (row) => toMinuteOfDay(row.timestamp) <= MORNING_END_MINUTE,
    );
    const afternoon = dayRows.filter(
      (row) => toMinuteOfDay(row.timestamp) > MORNING_END_MINUTE,
    );
    for (const session of [morning, afternoon]) {
      for (
        let start = 0;
        start < session.length;
        start += BARS_PER_THIRTY_MINUTE
      ) {
        const slice = session.slice(start, start + BARS_PER_THIRTY_MINUTE);
        if (slice.length === 0) continue;
        result.push(mergeGroup(slice, segments));
      }
    }
  }

  return result;
}

function mergeGroup(
  group: readonly VendorCsvRow[],
  segments: readonly QualitySegment[],
): GroupedBar {
  const first = group[0];
  const last = group[group.length - 1];
  const qualities = group.map((row) => resolveQuality(row.timestamp, segments));
  const base = resolveQuality(last.timestamp, segments);

  for (const quality of qualities) {
    if (
      quality.caliberEpoch !== qualities[0].caliberEpoch ||
      quality.volumeScale !== qualities[0].volumeScale ||
      quality.amountScale !== qualities[0].amountScale
    ) {
      throw new VendorImportError(
        `quality segment boundary splits a thirty-minute group at ${last.timestamp.toISOString()}`,
      );
    }
  }

  return {
    timestamp: last.timestamp,
    open: first.open,
    high: Math.max(...group.map((row) => row.high)),
    low: Math.min(...group.map((row) => row.low)),
    close: last.close,
    volume: group.reduce((sum, row) => sum + row.volume, 0),
    amount: group.reduce((sum, row) => sum + row.amount, 0),
    quality: {
      ...base,
      ...mergeValidity(qualities),
      manualFix: group.some((row) => row.manualFix) ? 1 : 0,
    },
  };
}

function mergeValidity(
  qualities: readonly BarQuality[],
): Pick<BarQuality, ValidityField> {
  const merged = {} as Record<ValidityField, ValidityFlag>;
  for (const field of VALIDITY_FIELDS) {
    merged[field] = qualities.every((quality) => quality[field] === 1) ? 1 : 0;
  }
  return merged;
}

export interface BuildVendorImportOptions {
  readonly securityId: number;
  readonly datasetVersion: string;
  readonly segments: readonly QualitySegment[];
}

/**
 * Build both periods plus their quality rows. Five-minute bars are native;
 * thirty-minute bars declare `derivedFromPeriod = 5`.
 */
export function buildVendorImport(
  rows: readonly VendorCsvRow[],
  options: BuildVendorImportOptions,
): VendorImportBundle {
  const fiveMinuteBars: VendorKRow[] = [];
  const fiveMinuteQualities: VendorQualityRow[] = [];

  for (const row of rows) {
    const quality = resolveQuality(row.timestamp, options.segments);
    if (
      row.quality === BAD_QUALITY &&
      quality.highValid === 1 &&
      quality.lowValid === 1
    ) {
      throw new VendorImportError(
        `bar flagged bad is fully valid at ${row.timestamp.toISOString()}; add an explicit quality segment`,
      );
    }
    fiveMinuteBars.push({
      securityId: options.securityId,
      period: FIVE_MINUTE_PERIOD,
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      amount: row.amount,
    });
    fiveMinuteQualities.push({
      securityId: options.securityId,
      period: FIVE_MINUTE_PERIOD,
      timestamp: row.timestamp,
      quality: { ...quality, manualFix: row.manualFix ? 1 : 0 },
      derivedFromPeriod: null,
      datasetVersion: options.datasetVersion,
    });
  }

  const grouped = aggregateSessionThirtyMinute(rows, options.segments);
  const thirtyMinuteBars: VendorKRow[] = [];
  const thirtyMinuteQualities: VendorQualityRow[] = [];

  for (const bar of grouped) {
    thirtyMinuteBars.push({
      securityId: options.securityId,
      period: THIRTY_MINUTE_PERIOD,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
    });
    thirtyMinuteQualities.push({
      securityId: options.securityId,
      period: THIRTY_MINUTE_PERIOD,
      timestamp: bar.timestamp,
      quality: bar.quality,
      derivedFromPeriod: FIVE_MINUTE_PERIOD,
      datasetVersion: options.datasetVersion,
    });
  }

  return {
    fiveMinute: { bars: fiveMinuteBars, qualities: fiveMinuteQualities },
    thirtyMinute: { bars: thirtyMinuteBars, qualities: thirtyMinuteQualities },
  };
}
