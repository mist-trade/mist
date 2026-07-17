import { Injectable } from '@nestjs/common';
import {
  ExperimentalQmtSnapshotFrame,
  QmtExperimentalDropEvent,
  QmtExperimentalDropReason,
} from './experimental-qmt-realtime.types';

const STALE_AFTER_MS = 30_000;

interface StoredSnapshot {
  frame: ExperimentalQmtSnapshotFrame;
  receivedAt: number;
}

@Injectable()
export class InMemoryQmtRealtimeStore {
  private readonly snapshots = new Map<string, StoredSnapshot>();
  private readonly dropCounts = new Map<QmtExperimentalDropReason, number>();
  private currentEpochValue: string | null = null;
  private connectedValue = false;
  private lastSequenceValue = 0;
  private ownerIdValue: string | null = null;
  private ownerGenerationValue = 0;
  private lastDropValue: QmtExperimentalDropEvent | null = null;
  private lastErrorValue: { code: string; message: string; at: number } | null =
    null;

  beginEpoch(epoch: string, sequence = 0): void {
    if (this.currentEpochValue !== epoch) this.snapshots.clear();
    this.currentEpochValue = epoch;
    this.lastSequenceValue = sequence;
  }

  markConnected(): void {
    this.connectedValue = true;
  }

  markDisconnected(): void {
    this.connectedValue = false;
    this.currentEpochValue = null;
  }

  setOwner(ownerId: string | null, ownerGeneration: number): void {
    this.ownerIdValue = ownerId;
    this.ownerGenerationValue = ownerGeneration;
  }

  apply(frame: ExperimentalQmtSnapshotFrame): boolean {
    if (frame.streamEpoch !== this.currentEpochValue) {
      this.recordDrop(
        'epochMismatch',
        frame.symbol,
        'QMT_EXPERIMENTAL_EPOCH_MISMATCH',
      );
      return false;
    }
    if (frame.sequence <= this.lastSequenceValue) {
      this.recordDrop(
        frame.sequence === this.lastSequenceValue ? 'duplicate' : 'outOfOrder',
        frame.symbol,
        'QMT_EXPERIMENTAL_SEQUENCE_REJECTED',
      );
      return false;
    }
    this.lastSequenceValue = frame.sequence;
    this.snapshots.set(frame.symbol, { frame, receivedAt: Date.now() });
    return true;
  }

  recordDrop(
    reason: QmtExperimentalDropReason,
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
      streamEpoch: this.currentEpochValue,
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
      mode: 'builtin_experimental' as const,
      connected: this.connectedValue,
      currentStreamEpoch: this.currentEpochValue,
      lastSequence: this.lastSequenceValue,
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
    return this.currentEpochValue;
  }
}
