import type { ChanK } from '@app/chancore';
import type { ProjectedStrategyBar } from '@app/market-data';
import type { PaK } from '@app/pacore';

/**
 * Runtime bar → pure math bar mappings.
 *
 * This is the ONLY place where `StrategyBar` / `ProjectedStrategyBar` is projected
 * into `@app/chancore` / `@app/pacore` input shapes:
 * - `time` is copied verbatim from `StrategyBar.timestamp` (never shifted/rounded);
 * - Chan receives the imputed `effective` OHLC and quantity values;
 * - Pa receives numeric volume/amount; null/invalid values become `undefined`.
 */
export interface PureBarSource {
  readonly id?: number;
  readonly timestamp: Date;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: string | number | null;
  readonly amount?: string | number | null;
}

/**
 * Maps projected strategy bars to the ChanK series consumed by `@app/chancore`.
 * Shared by `plugin.chan.bsp` and `plugin.technical.fibonacci`.
 */
export function toChanKSeries(
  bars: readonly ProjectedStrategyBar[],
): readonly ChanK[] {
  const series: ChanK[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const ohlc = b.ohlc.effective;
    if (!ohlc) continue;
    series.push({
      id: i + 1,
      symbol: String(b.rawBar.securityId),
      time: b.rawBar.timestamp,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
      volume: b.volume.effective,
      amount: b.amount.effective,
    });
  }
  return series;
}

/**
 * Maps runtime/raw bars to the PaK series consumed by `@app/pacore`.
 * `StrategyBar` satisfies `PureBarSource` structurally; raw JSON rows must first be
 * projected to `{ timestamp, OHLC, volume, amount }`.
 */
export function toPaKSeries(bars: readonly PureBarSource[]): readonly PaK[] {
  return bars.map((b, i) => {
    const volume = toPaQuantity(b.volume);
    const amount = toPaQuantity(b.amount);
    return {
      id: b.id ?? i + 1,
      time: b.timestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      ...(volume === undefined ? {} : { volume }),
      ...(amount === undefined ? {} : { amount }),
    };
  });
}

function toPaQuantity(
  value: string | number | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
