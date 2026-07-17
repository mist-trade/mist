export const QMT_EXPERIMENTAL_CONTRACT = {
  payloadType: 'qmt.experimental.snapshot',
  schemaVersion: 0,
  draftRevision: 1,
  acquisitionProfile: 'qmt.get_full_tick.v0',
} as const;

export interface ExperimentalQmtNativeSnapshot {
  timetag: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  lastClose: number;
  volume: number;
  amount: number;
  [key: string]: unknown;
}

export interface ExperimentalQmtSnapshotFrame {
  payloadType: 'qmt.experimental.snapshot';
  schemaVersion: 0;
  draftRevision: 1;
  acquisitionProfile: 'qmt.get_full_tick.v0';
  streamEpoch: string;
  sequence: number;
  symbol: string;
  capturedAt: string;
  native: ExperimentalQmtNativeSnapshot;
}

export type QmtExperimentalDropReason =
  | 'decodeError'
  | 'contractMismatch'
  | 'validationError'
  | 'epochMismatch'
  | 'duplicate'
  | 'outOfOrder'
  | 'symbolNotAuthorized'
  | 'stale';

export interface QmtExperimentalDropEvent {
  reason: QmtExperimentalDropReason;
  symbol: string | null;
  errorCode: string;
  at: number;
}
