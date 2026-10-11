import { RealtimeNativeMapFrame, RealtimeSource } from './realtime.types';
import { isRecord, hasExactKeys, isRfc3339 } from '@app/utils';

const OUTER_KEYS = ['type', 'provider', 'data', 'timestamp'] as const;
const DATA_KEYS = ['schemaVersion', 'capturedAt', 'native'] as const;
const MAX_NATIVE_ENTRIES = 256;
const MAX_FRAME_BYTES = 1_048_576;

export interface DecodedRealtimeNativeMapMessage {
  provider: RealtimeSource;
  timestamp: string;
  data: RealtimeNativeMapFrame;
}

export class RealtimeNativeMapDecodeError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function parseRealtimeMessage(raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw, 'utf8') > MAX_FRAME_BYTES) {
    throw new RealtimeNativeMapDecodeError('REALTIME_FRAME_BYTES_EXCEEDED');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RealtimeNativeMapDecodeError('REALTIME_FRAME_JSON_INVALID');
  }
  if (!isRecord(parsed)) {
    throw new RealtimeNativeMapDecodeError('REALTIME_FRAME_ENVELOPE_INVALID');
  }
  return parsed;
}

export function decodeRealtimeNativeMapMessage(
  parsed: Record<string, unknown>,
  expectedProvider: RealtimeSource,
): DecodedRealtimeNativeMapMessage {
  if (!hasExactKeys(parsed, OUTER_KEYS)) {
    throw new RealtimeNativeMapDecodeError('REALTIME_FRAME_ENVELOPE_INVALID');
  }
  if (
    parsed['type'] !== 'realtime.native_snapshot' ||
    parsed['provider'] !== expectedProvider ||
    !isRfc3339(parsed['timestamp']) ||
    !isRecord(parsed['data']) ||
    !hasExactKeys(parsed['data'], DATA_KEYS)
  ) {
    throw new RealtimeNativeMapDecodeError('REALTIME_FRAME_CONTRACT_MISMATCH');
  }
  const data = parsed['data'];
  if (
    data['schemaVersion'] !== 2 ||
    !isRfc3339(data['capturedAt']) ||
    !isRecord(data['native'])
  ) {
    throw new RealtimeNativeMapDecodeError('REALTIME_FRAME_DATA_INVALID');
  }
  const entryCount = Object.keys(data['native']).length;
  if (
    entryCount === 0 ||
    entryCount > MAX_NATIVE_ENTRIES ||
    (expectedProvider === 'tdx' && entryCount !== 1)
  ) {
    throw new RealtimeNativeMapDecodeError(
      'REALTIME_FRAME_NATIVE_CARDINALITY_INVALID',
    );
  }
  return {
    provider: expectedProvider,
    timestamp: parsed['timestamp'],
    data: data as unknown as RealtimeNativeMapFrame,
  };
}

export { isRecord };
