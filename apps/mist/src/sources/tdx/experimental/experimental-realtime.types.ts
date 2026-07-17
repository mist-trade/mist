/**
 * Experimental TDX realtime types.
 *
 * Mirrors the frozen JSON Schema (contracts/tdx-realtime-snapshot-v0.json).
 * The wire is strictly validated — no silent fills, no alias parsing, no
 * normalizeSecurityCode fallback.
 */

/** Quality markers on a typed snapshot. Empty = clean. */
export interface ExperimentalSnapshotQuality {
  stale?: boolean;
  partialPrices?: boolean;
  nativeTimeUnavailable?: boolean;
}

/** Typed price fields. `last` is required; others present-or-null. */
export interface ExperimentalSnapshotPrices {
  last: number;
  open: number | null;
  high: number | null;
  low: number | null;
  lastClose: number | null;
  nativeVolume: number | null;
  nativeAmount: number | null;
}

/** The experimental TDX realtime snapshot wire frame. */
export interface ExperimentalTdxSnapshotFrame {
  payloadType: 'tdx.realtime.snapshot';
  schemaVersion: 0;
  draftRevision: 1;
  contractStatus: 'experimental';
  acquisitionProfile: 'tdx.get_market_snapshot';
  streamEpoch: string;
  sequence: number;
  symbol: string;
  capturedAt: string;
  eventTime: string | null;
  snapshot: ExperimentalSnapshotPrices;
  unitStatus: 'native-unverified';
  quality: ExperimentalSnapshotQuality;
}

/** Contract tuple accepted by this build. */
export const ACCEPTED_CONTRACT_TUPLE = {
  payloadType: 'tdx.realtime.snapshot',
  schemaVersion: 0,
  draftRevision: 1,
  acquisitionProfile: 'tdx.get_market_snapshot',
} as const;

/** Data-plane fence state per instrument. */
export interface InstrumentFenceState {
  currentEpoch: string | null;
  lastSequence: number;
  latestSnapshot: ExperimentalTdxSnapshotFrame | null;
  receivedAt: number | null; // Date.now() of last accepted frame (Mist clock)
  capturedAt: string | null; // frame.capturedAt (terminal clock, RFC3339)
}

/** Drop reasons recorded by the store/client. */
export type DropReason =
  | 'epochMismatch'
  | 'duplicate'
  | 'outOfOrder'
  | 'symbolNotAuthorized'
  | 'contractMismatch'
  | 'decodeError'
  | 'validationError';
