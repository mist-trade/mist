import { CanonicalRealtimeSnapshot } from '../../../realtime/realtime-native-frame';
import { TdxRealtimeSnapshotFrame } from './realtime.types';

export function toTdxCanonicalSnapshot(
  frame: TdxRealtimeSnapshotFrame,
): CanonicalRealtimeSnapshot {
  const native = frame.native;
  const last = requiredNumber(native, ['Now', 'now', 'Price', 'price']);
  const open = optionalNumber(native, ['Open', 'open']);
  const high = optionalNumber(native, ['Max', 'High', 'high']);
  const low = optionalNumber(native, ['Min', 'Low', 'low']);
  const lastClose = optionalNumber(native, [
    'LastClose',
    'PreClose',
    'lastClose',
  ]);
  const eventTime = parseBeijingTime(native['DateTime'] ?? native['datetime']);

  return {
    source: frame.source,
    symbol: frame.symbol,
    eventTime,
    capturedAt: frame.capturedAt,
    sequence: frame.sequence,
    streamEpoch: frame.streamEpoch,
    prices: { last, open, high, low, lastClose },
    cumulativeVolume: optionalNumber(native, ['Volume', 'volume']),
    cumulativeAmount: optionalNumber(native, ['Amount', 'amount']),
    quality: {
      eventTimeAvailable: eventTime !== null,
      partialPrices: [open, high, low, lastClose].some(
        (value) => value === null,
      ),
    },
    native: structuredClone(native),
  };
}

function requiredNumber(
  native: Record<string, unknown>,
  aliases: readonly string[],
): number {
  const value = optionalNumber(native, aliases);
  if (value === null || value <= 0) {
    throw new Error(`missing positive native field: ${aliases.join('|')}`);
  }
  return value;
}

function optionalNumber(
  native: Record<string, unknown>,
  aliases: readonly string[],
): number | null {
  for (const alias of aliases) {
    const value = native[alias];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
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
