import {
  CanonicalRealtimeSnapshot,
  RealtimeNativeFrame,
} from './realtime-native-frame';

export function toCanonicalSnapshot(
  frame: RealtimeNativeFrame,
): CanonicalRealtimeSnapshot {
  return frame.source === 'tdx' ? fromTdx(frame) : fromQmt(frame);
}

function fromTdx(frame: RealtimeNativeFrame): CanonicalRealtimeSnapshot {
  const native = frame.native;
  return build(frame, {
    last: requiredNumber(native, ['Now', 'now', 'Price', 'price']),
    open: optionalNumber(native, ['Open', 'open']),
    high: optionalNumber(native, ['Max', 'High', 'high']),
    low: optionalNumber(native, ['Min', 'Low', 'low']),
    lastClose: optionalNumber(native, ['LastClose', 'PreClose', 'lastClose']),
    volume: optionalNumber(native, ['Volume', 'volume']),
    amount: optionalNumber(native, ['Amount', 'amount']),
    eventTime: parseBeijingTime(native['DateTime'] ?? native['datetime']),
  });
}

function fromQmt(frame: RealtimeNativeFrame): CanonicalRealtimeSnapshot {
  const native = frame.native;
  return build(frame, {
    last: requiredNumber(native, ['lastPrice']),
    open: optionalNumber(native, ['open']),
    high: optionalNumber(native, ['high']),
    low: optionalNumber(native, ['low']),
    lastClose: optionalNumber(native, ['lastClose']),
    volume: optionalNumber(native, ['volume']),
    amount: optionalNumber(native, ['amount']),
    eventTime: parseBeijingTime(native['timetag']),
  });
}

function build(
  frame: RealtimeNativeFrame,
  values: {
    last: number;
    open: number | null;
    high: number | null;
    low: number | null;
    lastClose: number | null;
    volume: number | null;
    amount: number | null;
    eventTime: string | null;
  },
): CanonicalRealtimeSnapshot {
  return {
    source: frame.source,
    symbol: frame.symbol,
    eventTime: values.eventTime,
    capturedAt: frame.capturedAt,
    sequence: frame.sequence,
    streamEpoch: frame.streamEpoch,
    prices: {
      last: values.last,
      open: values.open,
      high: values.high,
      low: values.low,
      lastClose: values.lastClose,
    },
    cumulativeVolume: values.volume,
    cumulativeAmount: values.amount,
    quality: {
      eventTimeAvailable: values.eventTime !== null,
      partialPrices: [
        values.open,
        values.high,
        values.low,
        values.lastClose,
      ].some((value) => value === null),
    },
    native: structuredClone(frame.native),
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
