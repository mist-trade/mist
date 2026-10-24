#!/usr/bin/env node
/**
 * Third-party (vendor) 5-minute CSV → k / k_quality TSV generator.
 *
 * Pure parsing/aggregation lives in `libs/market-data/src/vendor-import`;
 * this file only performs IO, reporting and the daily-close reconciliation.
 *
 * Usage:
 *   pnpm data:vendor-import -- --code 000001 --security-id 5 \
 *     --input-dir ~/股票数据/clean_manual --out-dir /tmp/vendor-import
 *   pnpm data:vendor-import -- --all --input-dir ~/股票数据/clean_manual --out-dir /tmp/vendor-import
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  VENDOR_A_QUALITY_PROFILES,
  VendorImportError,
  assertVendorSeries,
  buildVendorImport,
  parseVendorCsv,
  type BarQuality,
  type VendorCsvRow,
  type VendorKRow,
  type VendorQualityRow,
} from '@app/market-data';

interface DatasetCatalogEntry {
  readonly code: string;
  readonly securityId: number;
  readonly file: string;
  readonly expectedFiveMinuteBars: number;
  readonly expectedThirtyMinuteBars: number;
}

/** security_id values verified against the production `securities` table. */
const DATASETS: readonly DatasetCatalogEntry[] = [
  {
    code: '000001',
    securityId: 5,
    file: '000001_上证指数_5m.csv',
    expectedFiveMinuteBars: 253477,
    expectedThirtyMinuteBars: 42247,
  },
  {
    code: '399001',
    securityId: 6,
    file: '399001_深证成指_5m.csv',
    expectedFiveMinuteBars: 132661,
    expectedThirtyMinuteBars: 22111,
  },
  {
    code: '000300',
    securityId: 7,
    file: '000300_沪深300_5m.csv',
    expectedFiveMinuteBars: 250981,
    expectedThirtyMinuteBars: 41831,
  },
  {
    code: '399006',
    securityId: 8,
    file: '399006_创业板指_5m.csv',
    expectedFiveMinuteBars: 190837,
    expectedThirtyMinuteBars: 31807,
  },
  {
    code: '399673',
    securityId: 13,
    file: '399673_创业板50_5m.csv',
    expectedFiveMinuteBars: 143893,
    expectedThirtyMinuteBars: 23983,
  },
];

const DEFAULT_DATASET_VERSION = 'clean_manual@2026-10-24';
const CLI_INPUT_DIR = 'input-dir';
const CLI_OUT_DIR = 'out-dir';
const CLI_ALL = '--all';
const CLI_CODE = 'code';
const CLI_SECURITY_ID = 'security-id';
const CLI_DATASET_VERSION = 'dataset-version';
const CLI_SKIP_RECONCILE = '--skip-reconcile';
const HOME_PREFIX = '~';
const PRICE_DECIMALS = 4;
const SCALE_DECIMALS = 8;
const DATE_LENGTH = 10;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const BEIJING_UTC_OFFSET_HOURS = 8;
const ALLOWED_BARS_PER_DAY = [48, 31, 6];
const DAILY_CLOSE_TOLERANCE = 0.001;
const KLINE_CACHE_DIR = path.resolve(__dirname, '../../.data/kline');

interface CliOptions {
  readonly all: boolean;
  readonly code?: string;
  readonly securityId?: number;
  readonly inputDir: string;
  readonly outDir: string;
  readonly datasetVersion: string;
  readonly skipReconcile: boolean;
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < argv.length) return argv[index + 1];
  return undefined;
}

function parseOptions(argv: readonly string[]): CliOptions {
  const inputDir = argValue(argv, CLI_INPUT_DIR);
  const outDir = argValue(argv, CLI_OUT_DIR);
  if (!inputDir || !outDir) {
    throw new VendorImportError('--input-dir and --out-dir are required');
  }
  const all = argv.includes(CLI_ALL);
  const code = argValue(argv, CLI_CODE);
  const securityIdRaw = argValue(argv, CLI_SECURITY_ID);
  if (!all && (!code || !securityIdRaw)) {
    throw new VendorImportError(
      'either --all or --code with --security-id is required',
    );
  }
  return {
    all,
    code,
    securityId: securityIdRaw ? Number(securityIdRaw) : undefined,
    inputDir: resolveHome(inputDir),
    outDir: resolveHome(outDir),
    datasetVersion:
      argValue(argv, CLI_DATASET_VERSION) ?? DEFAULT_DATASET_VERSION,
    skipReconcile: argv.includes(CLI_SKIP_RECONCILE),
  };
}

function resolveHome(input: string): string {
  return input.startsWith(HOME_PREFIX)
    ? path.join(os.homedir(), input.slice(HOME_PREFIX.length))
    : input;
}

function formatTimestamp(timestamp: Date): string {
  const year = timestamp.getFullYear();
  const month = `${timestamp.getMonth() + 1}`.padStart(2, '0');
  const day = `${timestamp.getDate()}`.padStart(2, '0');
  const hour = `${timestamp.getHours()}`.padStart(2, '0');
  const minute = `${timestamp.getMinutes()}`.padStart(2, '0');
  const second = `${timestamp.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? `${value}`
    : value.toFixed(SCALE_DECIMALS).replace(/0+$/, '').replace(/\.$/, '');
}

function kRowToTsv(row: VendorKRow): string {
  return [
    row.securityId,
    row.period,
    formatTimestamp(row.timestamp),
    row.open.toFixed(PRICE_DECIMALS),
    row.high.toFixed(PRICE_DECIMALS),
    row.low.toFixed(PRICE_DECIMALS),
    row.close.toFixed(PRICE_DECIMALS),
    formatNumber(row.volume),
    formatNumber(row.amount),
  ].join('\t');
}

function qualityRowToTsv(row: VendorQualityRow): string {
  const quality: BarQuality = row.quality;
  return [
    row.securityId,
    row.period,
    formatTimestamp(row.timestamp),
    quality.openValid,
    quality.highValid,
    quality.lowValid,
    quality.closeValid,
    quality.volumeValid,
    quality.amountValid,
    formatNumber(quality.volumeScale),
    formatNumber(quality.amountScale),
    quality.caliberEpoch,
    quality.manualFix,
    row.derivedFromPeriod ?? '\\N',
    row.datasetVersion,
  ].join('\t');
}

interface QualitySummary {
  readonly bars: number;
  readonly priceInvalidBars: number;
  readonly volumeInvalidBars: number;
  readonly amountInvalidBars: number;
  readonly epochs: Record<string, number>;
}

function summarizeQuality(rows: readonly VendorQualityRow[]): QualitySummary {
  const epochs: Record<string, number> = {};
  let priceInvalidBars = 0;
  let volumeInvalidBars = 0;
  let amountInvalidBars = 0;
  for (const row of rows) {
    if (
      row.quality.openValid === 0 ||
      row.quality.highValid === 0 ||
      row.quality.lowValid === 0 ||
      row.quality.closeValid === 0
    ) {
      priceInvalidBars += 1;
    }
    if (row.quality.volumeValid === 0) volumeInvalidBars += 1;
    if (row.quality.amountValid === 0) amountInvalidBars += 1;
    const key = `${row.quality.caliberEpoch}`;
    epochs[key] = (epochs[key] ?? 0) + 1;
  }
  return {
    bars: rows.length,
    priceInvalidBars,
    volumeInvalidBars,
    amountInvalidBars,
    epochs,
  };
}

interface DailyCloseCheck {
  readonly checked: number;
  readonly mismatches: Array<{
    date: string;
    vendor: number;
    reference: number;
  }>;
}

/** Compare the vendor daily last close with the cached QMT daily series. */
function reconcileDailyClose(
  code: string,
  rows: readonly VendorCsvRow[],
): DailyCloseCheck | null {
  const cachePath = path.join(KLINE_CACHE_DIR, `${code}_1d.json`);
  if (!fs.existsSync(cachePath)) return null;
  const reference = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as Array<{
    time: string;
    close: number;
  }>;
  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(formatTimestamp(row.timestamp).slice(0, DATE_LENGTH), row.close);
  }
  const referenceByDay = new Map<string, number>();
  for (const item of reference) {
    const beijing = new Date(
      new Date(item.time).getTime() +
        BEIJING_UTC_OFFSET_HOURS * SECONDS_PER_HOUR * MILLISECONDS_PER_SECOND,
    );
    referenceByDay.set(
      beijing.toISOString().slice(0, DATE_LENGTH),
      Number(item.close),
    );
  }
  const mismatches: DailyCloseCheck['mismatches'] = [];
  let checked = 0;
  for (const [day, close] of byDay) {
    const ref = referenceByDay.get(day);
    if (ref === undefined) continue;
    checked += 1;
    const relative = Math.abs(close - ref) / Math.abs(ref);
    if (relative > DAILY_CLOSE_TOLERANCE) {
      mismatches.push({ date: day, vendor: close, reference: ref });
    }
  }
  return { checked, mismatches };
}

function runDataset(entry: DatasetCatalogEntry, options: CliOptions): void {
  const inputPath = path.join(options.inputDir, entry.file);
  if (!fs.existsSync(inputPath)) {
    throw new VendorImportError(`input file not found: ${inputPath}`);
  }

  const rows = parseVendorCsv(fs.readFileSync(inputPath, 'utf-8'));
  const distribution = assertVendorSeries(rows, {
    expectedBarsPerDay: ALLOWED_BARS_PER_DAY,
  });

  const segments = VENDOR_A_QUALITY_PROFILES[entry.code];
  if (!segments) {
    throw new VendorImportError(`no quality profile for ${entry.code}`);
  }

  const bundle = buildVendorImport(rows, {
    securityId: entry.securityId,
    datasetVersion: options.datasetVersion,
    segments,
  });

  if (bundle.fiveMinute.bars.length !== entry.expectedFiveMinuteBars) {
    throw new VendorImportError(
      `${entry.code}: expected ${entry.expectedFiveMinuteBars} five-minute bars, got ${bundle.fiveMinute.bars.length}`,
    );
  }
  if (bundle.thirtyMinute.bars.length !== entry.expectedThirtyMinuteBars) {
    throw new VendorImportError(
      `${entry.code}: expected ${entry.expectedThirtyMinuteBars} thirty-minute bars, got ${bundle.thirtyMinute.bars.length}`,
    );
  }

  const reconcile = options.skipReconcile
    ? null
    : reconcileDailyClose(entry.code, rows);
  if (reconcile && reconcile.mismatches.length > 0) {
    throw new VendorImportError(
      `${entry.code}: ${reconcile.mismatches.length} daily closes deviate from the reference series`,
    );
  }

  fs.mkdirSync(options.outDir, { recursive: true });
  const writes: Array<[string, string]> = [
    [
      `${entry.code}_k_5m.tsv`,
      bundle.fiveMinute.bars.map(kRowToTsv).join('\n') + '\n',
    ],
    [
      `${entry.code}_k_30m.tsv`,
      bundle.thirtyMinute.bars.map(kRowToTsv).join('\n') + '\n',
    ],
    [
      `${entry.code}_quality_5m.tsv`,
      bundle.fiveMinute.qualities.map(qualityRowToTsv).join('\n') + '\n',
    ],
    [
      `${entry.code}_quality_30m.tsv`,
      bundle.thirtyMinute.qualities.map(qualityRowToTsv).join('\n') + '\n',
    ],
  ];
  for (const [name, content] of writes) {
    fs.writeFileSync(path.join(options.outDir, name), content);
  }

  const manifest = {
    code: entry.code,
    securityId: entry.securityId,
    datasetVersion: options.datasetVersion,
    firstDay: formatTimestamp(rows[0].timestamp),
    lastDay: formatTimestamp(rows[rows.length - 1].timestamp),
    fiveMinuteBars: bundle.fiveMinute.bars.length,
    thirtyMinuteBars: bundle.thirtyMinute.bars.length,
    barsPerDay: Object.fromEntries(
      [...distribution.entries()].sort((a, b) => a[0] - b[0]),
    ),
    quality5m: summarizeQuality(bundle.fiveMinute.qualities),
    quality30m: summarizeQuality(bundle.thirtyMinute.qualities),
    dailyClose: reconcile,
  };
  fs.writeFileSync(
    path.join(options.outDir, `${entry.code}_manifest.json`),
    JSON.stringify(manifest, null, 2),
  );

  console.log(
    `[vendor-import] ${entry.code} id=${entry.securityId} 5m=${bundle.fiveMinute.bars.length} 30m=${bundle.thirtyMinute.bars.length} ` +
      `priceInvalid=${manifest.quality5m.priceInvalidBars} volumeInvalid=${manifest.quality5m.volumeInvalidBars} ` +
      `epochs=${JSON.stringify(manifest.quality5m.epochs)} dailyCloseChecked=${reconcile?.checked ?? 0}`,
  );
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  const datasets = options.all
    ? DATASETS
    : [
        {
          ...(DATASETS.find((entry) => entry.code === options.code) ?? {
            code: options.code as string,
            securityId: options.securityId as number,
            file: '',
            expectedFiveMinuteBars: -1,
            expectedThirtyMinuteBars: -1,
          }),
          securityId: options.securityId as number,
        },
      ];

  for (const entry of datasets) {
    if (!entry.file) {
      throw new VendorImportError(
        `unknown dataset code ${entry.code}; add it to DATASETS`,
      );
    }
    runDataset(entry, options);
  }
}

main();
