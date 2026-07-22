import { RealtimeNativeFrame } from '../../../realtime/realtime-native-frame';

export const QMT_REALTIME_CONTRACT = {
  payloadType: 'mist.realtime.native_snapshot',
  schemaVersion: 1,
  sequenceScope: 'symbol',
  source: 'qmt',
  acquisitionProfile: 'qmt.get_full_tick',
} as const;

export interface QmtNativeSnapshot extends Record<string, unknown> {
  timetag: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  lastClose: number;
  volume: number;
  amount: number;
}

export interface QmtRealtimeSnapshotFrame extends RealtimeNativeFrame {
  source: 'qmt';
  acquisitionProfile: 'qmt.get_full_tick';
  native: QmtNativeSnapshot;
}

export type QmtRealtimeDropReason =
  | 'decodeError'
  | 'contractMismatch'
  | 'validationError'
  | 'epochMismatch'
  | 'duplicate'
  | 'outOfOrder'
  | 'symbolNotAuthorized'
  | 'stale';

export interface QmtRealtimeDropEvent {
  reason: QmtRealtimeDropReason;
  symbol: string | null;
  errorCode: string;
  at: number;
}
