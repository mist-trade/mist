import type { DataSource } from '@app/shared-data';

/**
 * A policy segment: one provider owns `[from, before)`.
 * `from` is inclusive, `before` exclusive, both are Beijing calendar dates.
 * The first segment may omit `from`; the last may omit `before`.
 */
export interface SpliceSegment {
  readonly source: DataSource;
  readonly from?: string;
  readonly before?: string;
}

export interface SplicePolicyOverride {
  readonly security: string;
  readonly periods: Readonly<Record<string, readonly SpliceSegment[]>>;
}

/**
 * Externally supplied splice policy. Segments are ordered; when two segments
 * overlap the earlier one wins and the later one is clipped during resolution.
 */
export interface SplicePolicy {
  readonly version: string;
  readonly defaults: Readonly<Record<string, readonly SpliceSegment[]>>;
  readonly overrides?: readonly SplicePolicyOverride[];
}

export interface SplicePolicyProvider {
  readonly id: string;
  load(): SplicePolicy | null;
}

/** A segment after date parsing, before clipping. */
export interface ResolvedSegment {
  readonly source: DataSource;
  readonly from: Date | null;
  readonly before: Date | null;
}

export type CanonicalErrorCode =
  | 'CANONICAL_POLICY_UNAVAILABLE'
  | 'CANONICAL_POLICY_INVALID'
  | 'CANONICAL_SEGMENT_UNRESOLVED';

export class CanonicalDataError extends Error {
  constructor(
    readonly code: CanonicalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CanonicalDataError';
  }
}
