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
  ExperimentalDropEvent,
  ExperimentalRuntimeMetadata,
} from './experimental-realtime.types';

const STALE_AFTER_MS = 30_000;
const DROP_REASONS: readonly DropReason[] = [
  'epochMismatch',
  'duplicate',
  'outOfOrder',
  'symbolNotAuthorized',
  'contractMismatch',
  'decodeError',
  'validationError',
];

@Injectable()
export class InMemoryRealtimeStore {
  private readonly logger = new Logger(InMemoryRealtimeStore.name);
  private readonly states = new Map<string, InstrumentFenceState>();
  private currentEpoch: string | null = null;
  private connected = false;
  // Drop counters.
  private readonly dropCounts = new Map<DropReason, number>();
  private readonly symbolDropCounts = new Map<
    string,
    Map<DropReason, number>
  >();
  private lastDrop: ExperimentalDropEvent | null = null;
  private readonly lastDropBySymbol = new Map<string, ExperimentalDropEvent>();
  private runtimeMetadata: ExperimentalRuntimeMetadata = {
    ready: false,
    ownerId: null,
    datasourceBuildId: null,
    bridgeBuildId: null,
    currentGeneration: null,
    lastError: null,
  };

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
    this.runtimeMetadata.ready = false;
    // Clear epoch so stale snapshots from before disconnect cannot match
    // after reconnect until a new ready/stream_started establishes epoch.
    this.currentEpoch = null;
  }

  /** Clear all stored state (epoch + snapshots). Used when ready reports null owner. */
  clearAll(): void {
    this.currentEpoch = null;
    this.states.clear();
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
      this.recordDrop('epochMismatch', key);
      return false;
    }
    let state = this.states.get(key);
    if (!state) {
      state = {
        currentEpoch: epoch,
        lastSequence: 0,
        latestSnapshot: null,
        receivedAt: null,
        capturedAt: null,
      };
      this.states.set(key, state);
    }
    if (sequence <= state.lastSequence) {
      this.recordDrop(
        sequence === state.lastSequence ? 'duplicate' : 'outOfOrder',
        key,
      );
      return false;
    }
    // Accept: atomic check-and-set (synchronous, no await).
    state.currentEpoch = epoch;
    state.lastSequence = sequence;
    state.latestSnapshot = snapshot;
    state.receivedAt = Date.now();
    state.capturedAt = snapshot.capturedAt;
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
    capturedAt: string | null;
    captureToReceiveLatencyMs: number | null;
    latestAgeMs: number | null;
    fresh: boolean;
    stale: boolean;
    staleReason: string | null;
    lastDrop: ExperimentalDropEvent | null;
    dropCounts: Record<string, number>;
  } | null {
    const state = this.states.get(key);
    if (!state) return null;
    const now = Date.now();
    const age = state.receivedAt ? now - state.receivedAt : null;

    // Compute terminal→Mist latency from capturedAt vs receivedAt.
    let captureToReceiveLatencyMs: number | null = null;
    if (state.capturedAt && state.receivedAt) {
      const capturedMs = Date.parse(state.capturedAt);
      if (!Number.isNaN(capturedMs)) {
        captureToReceiveLatencyMs = state.receivedAt - capturedMs;
      }
    }

    // Determine freshness with all factors.
    let staleReason: string | null = null;
    if (!this.connected) staleReason = 'disconnected';
    else if (this.currentEpoch === null) staleReason = 'noEpoch';
    else if (state.currentEpoch !== this.currentEpoch)
      staleReason = 'epochMismatch';
    else if (age === null || age > STALE_AFTER_MS) staleReason = 'ageStale';
    // Check frame-level quality.stale (terminal/provider marked it stale).
    else if (state.latestSnapshot?.quality?.stale === true)
      staleReason = 'qualityStale';
    // Check terminal→Mist latency (if > threshold, data is transit-stale).
    else if (
      captureToReceiveLatencyMs !== null &&
      captureToReceiveLatencyMs > STALE_AFTER_MS
    )
      staleReason = 'transitStale';

    const fresh = staleReason === null;
    return {
      snapshot: state.latestSnapshot,
      epoch: state.currentEpoch,
      lastSequence: state.lastSequence,
      receivedAt: state.receivedAt,
      capturedAt: state.capturedAt,
      captureToReceiveLatencyMs,
      latestAgeMs: age,
      fresh,
      stale: !fresh,
      staleReason,
      lastDrop: this.lastDropBySymbol.get(key) ?? null,
      dropCounts: this.getSymbolDropCounts(key),
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
    return Object.fromEntries(
      DROP_REASONS.map((reason) => [reason, this.getDropCount(reason)]),
    );
  }

  getLastDrop(): ExperimentalDropEvent | null {
    return this.lastDrop ? { ...this.lastDrop } : null;
  }

  getSymbolDropCounts(symbol: string): Record<string, number> {
    return Object.fromEntries(this.symbolDropCounts.get(symbol) ?? []);
  }

  getRuntimeMetadata(): ExperimentalRuntimeMetadata {
    return {
      ...this.runtimeMetadata,
      lastError: this.runtimeMetadata.lastError
        ? { ...this.runtimeMetadata.lastError }
        : null,
    };
  }

  updateRuntimeMetadata(
    metadata: Partial<Omit<ExperimentalRuntimeMetadata, 'lastError'>>,
  ): void {
    this.runtimeMetadata = { ...this.runtimeMetadata, ...metadata };
  }

  setRuntimeError(code: string, message: string): void {
    this.runtimeMetadata.lastError = { code, message, at: Date.now() };
  }

  clearRuntimeError(): void {
    this.runtimeMetadata.lastError = null;
  }

  /** Active symbols with their snapshot keys (for diagnostic /status). */
  getActiveSymbols(): string[] {
    return [...this.states.keys()];
  }

  recordDrop(
    reason: DropReason,
    symbol: string | null = null,
    errorCode: string | null = null,
  ): void {
    this.dropCounts.set(reason, (this.dropCounts.get(reason) ?? 0) + 1);
    if (symbol !== null) {
      const counts = this.symbolDropCounts.get(symbol) ?? new Map();
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
      this.symbolDropCounts.set(symbol, counts);
    }
    this.lastDrop = { reason, symbol, errorCode, at: Date.now() };
    if (symbol !== null) this.lastDropBySymbol.set(symbol, this.lastDrop);
  }
}
