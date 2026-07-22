export type RealtimeFenceRejectReason =
  | 'epochMismatch'
  | 'duplicate'
  | 'outOfOrder';

export type RealtimeFenceDecision =
  | { accepted: true }
  | { accepted: false; reason: RealtimeFenceRejectReason };

/** Shared synchronous epoch + per-symbol sequence fence for all transports. */
export class RealtimeSymbolSequenceFence {
  private epochValue: string | null = null;
  private readonly sequences = new Map<string, number>();

  beginEpoch(epoch: string): boolean {
    if (this.epochValue === epoch) return false;
    this.epochValue = epoch;
    this.sequences.clear();
    return true;
  }

  disconnect(): void {
    this.epochValue = null;
  }

  clear(): void {
    this.epochValue = null;
    this.sequences.clear();
  }

  invalidateSymbol(symbol: string): void {
    this.sequences.delete(symbol);
  }

  accept(
    symbol: string,
    epoch: string,
    sequence: number,
  ): RealtimeFenceDecision {
    if (epoch !== this.epochValue) {
      return { accepted: false, reason: 'epochMismatch' };
    }
    const previous = this.sequences.get(symbol) ?? 0;
    if (sequence <= previous) {
      return {
        accepted: false,
        reason: sequence === previous ? 'duplicate' : 'outOfOrder',
      };
    }
    this.sequences.set(symbol, sequence);
    return { accepted: true };
  }

  get currentEpoch(): string | null {
    return this.epochValue;
  }

  get sequenceEntries(): ReadonlyMap<string, number> {
    return this.sequences;
  }
}
