import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PaK } from '@app/pacore';
import { toPaKSeries } from '../../libs/strategy/src/analysis/pure-bar-mapper';

/**
 * Shared PaK dataset loader for the PA audit/validation tools.
 *
 * Raw kline JSON is projected to `{ timestamp, OHLC, volume, amount }` first, then
 * handed to the single `toPaKSeries` mapper. `time` is copied from the raw bar time
 * verbatim; no offset or re-labelling happens here.
 */
export interface PaKlineLoadOptions {
  readonly startYear?: number;
  readonly limit?: number;
  readonly warnIfMissing?: boolean;
  readonly klineDir?: string;
}

interface RawKline {
  readonly id: number;
  readonly symbol?: string;
  readonly time: string;
  readonly open: number | string;
  readonly high: number | string;
  readonly low: number | string;
  readonly close: number | string;
  readonly volume?: string | number | null;
  readonly amount?: string | number | null;
}

export function paKlineDir(): string {
  return (
    process.env.MIST_KLINE_DIR || path.resolve(__dirname, '../.data/kline')
  );
}

export function loadPaKBars(
  fileName: string,
  options: PaKlineLoadOptions = {},
): PaK[] {
  const filePath = path.join(options.klineDir ?? paKlineDir(), fileName);
  if (!fs.existsSync(filePath)) {
    if (options.warnIfMissing) {
      console.warn(
        `⚠️ [pa-kline] 数据文件未找到: ${filePath}。如需运行真实数据体检，请设置 MIST_KLINE_DIR。`,
      );
    }
    return [];
  }

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawKline[];
  const filtered =
    options.startYear === undefined
      ? rawData
      : rawData.filter(
          (bar) => new Date(bar.time).getFullYear() >= options.startYear!,
        );
  const limited =
    options.limit === undefined ? filtered : filtered.slice(0, options.limit);

  return [
    ...toPaKSeries(
      limited.map((bar) => ({
        id: bar.id,
        timestamp: new Date(bar.time),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: bar.volume,
        amount: bar.amount,
      })),
    ),
  ];
}
