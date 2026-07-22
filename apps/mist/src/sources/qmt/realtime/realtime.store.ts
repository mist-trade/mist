import { Injectable } from '@nestjs/common';
import {
  QmtRealtimeSnapshotFrame,
  QmtRealtimeDropEvent,
  QmtRealtimeDropReason,
} from './realtime.types';
import { RealtimeSymbolSequenceFence } from '../../../realtime/realtime-symbol-sequence-fence';

const STALE_AFTER_MS = 30_000;

interface StoredSnapshot {
  frame: QmtRealtimeSnapshotFrame;
  receivedAt: number;
}

@Injectable()
export class QmtRealtimeStore {
  private readonly snapshots = new Map<string, StoredSnapshot>();
  private readonly fence = new RealtimeSymbolSequenceFence();
  private readonly dropCounts = new Map<QmtRealtimeDropReason, number>();
  private connectedValue = false;
  private ownerIdValue: string | null = null;
  private ownerGenerationValue = 0;
  private lastDropValue: QmtRealtimeDropEvent | null = null;
  private lastErrorValue: { code: string; message: string; at: number } | null =
    null;

  beginEpoch(epoch: string): void {
    if (this.fence.beginEpoch(epoch)) this.snapshots.clear();
  }

  markConnected(): void {
    this.connectedValue = true;
  }

  markDisconnected(): void {
    this.connectedValue = false;
    this.fence.disconnect();
  }

  setOwner(ownerId: string | null, ownerGeneration: number): void {
    this.ownerIdValue = ownerId;
    this.ownerGenerationValue = ownerGeneration;
  }

  apply(frame: QmtRealtimeSnapshotFrame): boolean {
    const decision = this.fence.accept(
      frame.symbol,
      frame.streamEpoch,
      frame.sequence,
    );
    if (!decision.accepted) {
      this.recordDrop(
        decision.reason,
        frame.symbol,
        decision.reason === 'epochMismatch'
          ? 'QMT_REALTIME_EPOCH_MISMATCH'
          : 'QMT_REALTIME_SEQUENCE_REJECTED',
      );
      return false;
    }
    this.snapshots.set(frame.symbol, { frame, receivedAt: Date.now() });
    return true;
  }

  recordDrop(
    reason: QmtRealtimeDropReason,
    symbol: string | null,
    errorCode: string,
  ): void {
    this.dropCounts.set(reason, (this.dropCounts.get(reason) ?? 0) + 1);
    this.lastDropValue = { reason, symbol, errorCode, at: Date.now() };
  }

  setError(code: string, message: string): void {
    this.lastErrorValue = { code, message, at: Date.now() };
  }

  clearError(): void {
    this.lastErrorValue = null;
  }

  read(formatCode: string) {
    const stored = this.snapshots.get(formatCode);
    if (!stored) return null;
    const latestAgeMs = Date.now() - stored.receivedAt;
    const stale = !this.connectedValue || latestAgeMs > STALE_AFTER_MS;
    return {
      snapshot: stored.frame,
      streamEpoch: this.fence.currentEpoch,
      sequence: stored.frame.sequence,
      receivedAt: stored.receivedAt,
      latestAgeMs,
      fresh: !stale,
      stale,
      staleReason: !this.connectedValue
        ? 'disconnected'
        : latestAgeMs > STALE_AFTER_MS
          ? 'ageStale'
          : null,
    };
  }

  status() {
    return {
      mode: 'builtin' as const,
      connected: this.connectedValue,
      currentStreamEpoch: this.fence.currentEpoch,
      lastSequences: Object.fromEntries(this.fence.sequenceEntries),
      ownerId: this.ownerIdValue,
      ownerGeneration: this.ownerGenerationValue,
      activeSymbolCount: this.snapshots.size,
      activeSymbols: [...this.snapshots.keys()],
      dropCounts: Object.fromEntries(this.dropCounts),
      lastDrop: this.lastDropValue ? { ...this.lastDropValue } : null,
      lastError: this.lastErrorValue ? { ...this.lastErrorValue } : null,
    };
  }

  get currentEpoch(): string | null {
    return this.fence.currentEpoch;
  }
}
