import {
  readTdxNativeNumber,
  toTdxCanonicalSnapshot,
} from './realtime-native.adapter';
import { TdxRealtimeSnapshotFrame } from './realtime.types';

describe('TDX realtime native adapter', () => {
  it('preserves native data and maps canonical fields at the source boundary', () => {
    const native = {
      Now: 31.25,
      Open: 31.1,
      Max: 31.4,
      Min: 30.98,
      LastClose: 31,
      Volume: 12,
      Amount: 20,
      DateTime: '2026-07-22 10:01:02',
    };
    const result = toTdxCanonicalSnapshot(frame(native));

    expect(result.prices.last).toBe(31.25);
    expect(result.eventTime).toBe('2026-07-22T10:01:02+08:00');
    expect(result.native).toEqual(native);
    expect(result.native).not.toBe(native);
  });

  it('parses provider-native numeric strings without changing the native object', () => {
    const native = {
      Now: '1294.59',
      Open: '1288.00',
      Max: '1298.50',
      Min: '1285.25',
      LastClose: '1287.75',
      Volume: '34450',
      Amount: '44592710.5',
      DateTime: '2026-07-22 10:35:38',
    };

    const result = toTdxCanonicalSnapshot(frame(native));

    expect(result.prices).toEqual({
      last: 1294.59,
      open: 1288,
      high: 1298.5,
      low: 1285.25,
      lastClose: 1287.75,
    });
    expect(result.cumulativeVolume).toBe(34450);
    expect(result.cumulativeAmount).toBe(44592710.5);
    expect(result.native).toEqual(native);
  });

  it('rejects non-finite and loosely formatted numeric strings', () => {
    expect(readTdxNativeNumber({ Now: 'NaN' }, ['Now'])).toBeNull();
    expect(readTdxNativeNumber({ Now: ' 1294.59 ' }, ['Now'])).toBeNull();
    expect(readTdxNativeNumber({ Now: '1294.59 CNY' }, ['Now'])).toBeNull();
  });
});

function frame(native: Record<string, unknown>): TdxRealtimeSnapshotFrame {
  return {
    payloadType: 'mist.realtime.native_snapshot',
    schemaVersion: 1,
    source: 'tdx',
    acquisitionProfile: 'tdx.get_market_snapshot',
    streamEpoch: 'epoch-1',
    sequence: 1,
    sequenceScope: 'symbol',
    symbol: '600030.SH',
    capturedAt: '2026-07-22T10:01:02.500+08:00',
    native,
  };
}
