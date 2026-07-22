import { RealtimeNativeFrame } from '../../../realtime/realtime-native-frame';

export interface TdxRealtimeSnapshotFrame extends RealtimeNativeFrame {
  source: 'tdx';
  acquisitionProfile: 'tdx.get_market_snapshot';
  /** @deprecated canonical fields live on the backend adapter output. */
  eventTime?: string | null;
  /** @deprecated canonical fields live on the backend adapter output. */
  quality?: Record<string, boolean>;
}

export const ACCEPTED_CONTRACT_TUPLE = {
  payloadType: 'mist.realtime.native_snapshot',
  schemaVersion: 1,
  source: 'tdx',
  sequenceScope: 'symbol',
  acquisitionProfile: 'tdx.get_market_snapshot',
} as const;

export interface InstrumentFenceState {
  currentEpoch: string | null;
  lastSequence: number;
  latestSnapshot: TdxRealtimeSnapshotFrame | null;
  receivedAt: number | null;
  capturedAt: string | null;
}

export type DropReason =
  | 'epochMismatch'
  | 'duplicate'
  | 'outOfOrder'
  | 'symbolNotAuthorized'
  | 'contractMismatch'
  | 'decodeError'
  | 'validationError';

export interface RealtimeDropEvent {
  reason: DropReason;
  symbol: string | null;
  at: number;
  errorCode: string | null;
}

export interface RealtimeRuntimeError {
  code: string;
  message: string;
  at: number;
}

export interface RealtimeRuntimeMetadata {
  ready: boolean;
  ownerId: string | null;
  datasourceBuildId: string | null;
  bridgeBuildId: string | null;
  currentGeneration: number | null;
  lastError: RealtimeRuntimeError | null;
}
