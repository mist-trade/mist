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

export type ChanSwingLevel = 'bi' | 'duan';

/**
 * The last completed, valid Chan unit of the requested level — the shared swing anchor
 * for the Fibonacci visual layer (same `Complete && Valid` filter contract as the
 * strategy-side plugins). Returns `null` when no completed unit exists; callers MUST NOT
 * fall back to a rolling-window anchor.
 */
export function findLastCompletedSwing(
  klines: readonly ChanK[],
  units: ChanSwingLevel,
): ChanBi | ChanDuan | null {
  const phaseB = ChanCore.createBi(klines).phaseB;
  if (units === 'duan') {
    const duans = ChanCore.createDuan(phaseB).filter(
      (d) => d.type === DuanType.Complete && d.status === DuanStatus.Valid,
    );
    return duans.length > 0 ? duans[duans.length - 1] : null;
  }
  const bis = phaseB.filter(
    (b) => b.type === BiType.Complete && b.status === BiStatus.Valid,
  );
  return bis.length > 0 ? bis[bis.length - 1] : null;
}
