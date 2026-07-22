import { CanonicalRealtimeSnapshot } from '../../../realtime/realtime-native-frame';
import { QmtRealtimeSnapshotFrame } from './realtime.types';

export function toQmtCanonicalSnapshot(
  frame: QmtRealtimeSnapshotFrame,
): CanonicalRealtimeSnapshot {
  const native = frame.native;
  const eventTime = parseBeijingTime(native.timetag);
  const { open, high, low, lastClose } = native;

  return {
    source: frame.source,
    symbol: frame.symbol,
    eventTime,
    capturedAt: frame.capturedAt,
    sequence: frame.sequence,
    streamEpoch: frame.streamEpoch,
    prices: { last: native.lastPrice, open, high, low, lastClose },
    cumulativeVolume: native.volume,
    cumulativeAmount: native.amount,
    quality: {
      eventTimeAvailable: eventTime !== null,
      partialPrices: [open, high, low, lastClose].some(
        (value) => !Number.isFinite(value),
      ),
    },
    native: structuredClone(native),
  };
}

function parseBeijingTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4})(?:-?)(\d{2})(?:-?)(\d{2})[ T]?(\d{2}):(\d{2}):(\d{2})$/.exec(
      value,
    );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const candidate = `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}
