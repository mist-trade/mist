/**
 * InMemoryRealtimeStore — data-plane epoch/sequence fence for experimental
 * TDX realtime snapshots.
 *
 * Synchronous compare-and-set: epoch/sequence validation and state update
 * happen atomically with no `await` between check and set. This is safe for
 * single-process (mist-backend single-instance) deployment.
 *
 * Lifecycle:
 * - `beginEpoch(epoch)` — called on ready/stream_started, clears old state.
 * - `applyIfCurrentAndNewer(key, epoch, sequence, snapshot)` — CAS fence.
 * - `markDisconnected()` — WS disconnect marks inactive, does NOT clear data.
 * - `invalidateSymbol(key)` — on unsubscribe, removes that symbol.
 * - `readDebug(key)` — diagnostic readback.
 *
 * No background TTL; freshness is judged lazily on read via receivedAt/capturedAt.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ExperimentalTdxSnapshotFrame,
  InstrumentFenceState,
  DropReason,
} from './experimental-realtime.types';

const STALE_AFTER_MS = 30_000;

@Injectable()
export class InMemoryRealtimeStore {
  private readonly logger = new Logger(InMemoryRealtimeStore.name);
  private readonly states = new Map<string, InstrumentFenceState>();
  private currentEpoch: string | null = null;
  private connected = false;
  // Drop counters.
  private readonly dropCounts = new Map<DropReason, number>();

  /** Set the current stream epoch (from ready/stream_started). Clears all state. */
  beginEpoch(epoch: string): void {
    if (this.currentEpoch !== epoch) {
      this.currentEpoch = epoch;
      this.states.clear();
      this.logger.log(
        `epoch begun: ${epoch}, cleared ${this.states.size} instruments`,
      );
    }
  }

  markConnected(): void {
    this.connected = true;
  }

  markDisconnected(): void {
    this.connected = false;
    // Data retained but marked inactive (lazy stale on read).
  }

  /**
   * Apply a snapshot only if epoch matches and sequence is strictly newer.
   * Synchronous CAS — no await between check and set.
   * Returns true if accepted, false if dropped (records drop reason).
   */
  applyIfCurrentAndNewer(
    key: string,
    epoch: string,
    sequence: number,
    snapshot: ExperimentalTdxSnapshotFrame,
  ): boolean {
    if (epoch !== this.currentEpoch) {
      this.recordDrop('epochMismatch');
      return false;
    }
    let state = this.states.get(key);
    if (!state) {
      state = {
        currentEpoch: epoch,
        lastSequence: 0,
        latestSnapshot: null,
        receivedAt: null,
      };
      this.states.set(key, state);
    }
    if (sequence <= state.lastSequence) {
      this.recordDrop(
        sequence === state.lastSequence ? 'duplicate' : 'outOfOrder',
      );
      return false;
    }
    // Accept: atomic check-and-set (synchronous, no await).
    state.currentEpoch = epoch;
    state.lastSequence = sequence;
    state.latestSnapshot = snapshot;
    state.receivedAt = Date.now();
    return true;
  }

  invalidateSymbol(key: string): void {
    this.states.delete(key);
  }

  readDebug(key: string): {
    snapshot: ExperimentalTdxSnapshotFrame | null;
    epoch: string | null;
    lastSequence: number;
    receivedAt: number | null;
    fresh: boolean;
    stale: boolean;
  } | null {
    const state = this.states.get(key);
    if (!state) return null;
    const age = state.receivedAt ? Date.now() - state.receivedAt : null;
    const fresh = age !== null && age <= STALE_AFTER_MS && this.connected;
    return {
      snapshot: state.latestSnapshot,
      epoch: state.currentEpoch,
      lastSequence: state.lastSequence,
      receivedAt: state.receivedAt,
      fresh,
      stale: !fresh,
    };
  }

  get currentStreamEpoch(): string | null {
    return this.currentEpoch;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get activeSymbolCount(): number {
    return this.states.size;
  }

  getDropCount(reason: DropReason): number {
    return this.dropCounts.get(reason) ?? 0;
  }

  getAllDropCounts(): Record<string, number> {
    return Object.fromEntries(this.dropCounts);
  }

  /** Active symbols with their snapshot keys (for diagnostic /status). */
  getActiveSymbols(): string[] {
    return [...this.states.keys()];
  }

  private recordDrop(reason: DropReason): void {
    this.dropCounts.set(reason, (this.dropCounts.get(reason) ?? 0) + 1);
  }
}
