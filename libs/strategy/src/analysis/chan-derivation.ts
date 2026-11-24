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

export type ChanSwingUnitLevel = 'bi' | 'duan';

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
