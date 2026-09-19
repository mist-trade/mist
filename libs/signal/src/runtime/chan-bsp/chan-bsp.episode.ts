import type { ChanBspEvent } from './chan-bsp.types';

export interface ChanBspEpisodeIdentity {
  readonly definitionId: number;
  readonly securityId: number;
  readonly source: 'tdx' | 'qmt';
  readonly level: number;
  readonly units: 'bi' | 'duan';
}

interface CursorRecord {
  lastEmittedTime: number;
  emittedTypesAtLastTime: Set<string>;
}

/**
 * Monotonic emission cursor for Chan BSP events.
 *
 * Emits only newly confirmed points: per identity it keeps the greatest
 * confirmed timestamp and emits events whose time advances it. Points
 * that disappear and reappear under structure evolution (e.g. a channel
 * extension invalidating a third-type point) are NOT re-emitted, and the
 * cursor never regresses. Multiple point types on the same confirming unit
 * (e.g. second + third on one segment) are emitted independently.
 *
 * Lifecycle mirrors the evaluation windows/episodes: reset on trading-day
 * rollover, pruned with the registry scopes on reconciliation (bounded).
 */
export class ChanBspEpisodeCursor {
  private readonly cursors = new Map<string, CursorRecord>();

  advance(
    identity: ChanBspEpisodeIdentity,
    events: readonly ChanBspEvent[],
  ): readonly ChanBspEvent[] {
    const key = identityKey(identity);
    let record = this.cursors.get(key);
    if (!record) {
      record = {
        lastEmittedTime: -1,
        emittedTypesAtLastTime: new Set<string>(),
      };
      this.cursors.set(key, record);
    }

    const fresh = events.filter((event) => {
      const eventTime = event.time.getTime();
      if (eventTime > record.lastEmittedTime) return true;
      if (eventTime === record.lastEmittedTime) {
        return !record.emittedTypesAtLastTime.has(event.type);
      }
      return false;
    });

    if (fresh.length > 0) {
      const maxTime = Math.max(...fresh.map((event) => event.time.getTime()));
      if (maxTime > record.lastEmittedTime) {
        record.lastEmittedTime = maxTime;
        record.emittedTypesAtLastTime = new Set(
          fresh
            .filter((event) => event.time.getTime() === maxTime)
            .map((event) => event.type),
        );
      } else {
        for (const event of fresh) {
          if (event.time.getTime() === record.lastEmittedTime) {
            record.emittedTypesAtLastTime.add(event.type);
          }
        }
      }
    }
    return Object.freeze(fresh);
  }

  reset(): void {
    this.cursors.clear();
  }

  retainIdentities(keys: ReadonlySet<string>): void {
    for (const key of this.cursors.keys()) {
      if (!keys.has(key)) this.cursors.delete(key);
    }
  }

  get activeCount(): number {
    return this.cursors.size;
  }
}

export function chanBspIdentityKey(identity: ChanBspEpisodeIdentity): string {
  return `${identity.definitionId}\u0000${identity.securityId}\u0000${identity.source}\u0000${identity.level}\u0000${identity.units}`;
}

function identityKey(identity: ChanBspEpisodeIdentity): string {
  return chanBspIdentityKey(identity);
}
