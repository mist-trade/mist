import {
  BiStatus,
  BiType,
  ChanCore,
  DuanStatus,
  DuanType,
  type ChanBi,
  type ChanDuan,
  type ChanK,
} from '@app/chancore';
import type { ProjectedStrategyBar } from '@app/market-data';

export type ChanSwingUnitLevel = 'bi' | 'duan';

/**
 * Maps projected strategy bars to the ChanK series consumed by `@app/chancore`.
 * Single source of truth for the bar → ChanK projection, shared by
 * `plugin.chan.bsp` and `plugin.technical.fibonacci`.
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

/** Completed and valid bis (the `Complete && Valid` filter contract used across the Chan plugins). */
export function deriveCompletedBis(
  klines: readonly ChanK[],
): readonly ChanBi[] {
  return ChanCore.createBi(klines).phaseB.filter(
    (b) => b.type === BiType.Complete && b.status === BiStatus.Valid,
  );
}

/** Completed and valid duans derived from the completed bi sequence. */
export function deriveCompletedDuans(
  klines: readonly ChanK[],
): readonly ChanDuan[] {
  const phaseB = ChanCore.createBi(klines).phaseB;
  return ChanCore.createDuan(phaseB).filter(
    (d) => d.type === DuanType.Complete && d.status === DuanStatus.Valid,
  );
}

/**
 * The last completed, valid Chan unit of the requested level — the swing anchor for
 * Fibonacci retracements. Returns `null` when no completed unit exists (callers must
 * NOT fall back to a rolling-window anchor).
 */
export function findLastCompletedSwing(
  klines: readonly ChanK[],
  units: ChanSwingUnitLevel,
): ChanBi | ChanDuan | null {
  const list =
    units === 'duan'
      ? deriveCompletedDuans(klines)
      : deriveCompletedBis(klines);
  return list.length > 0 ? list[list.length - 1] : null;
}
