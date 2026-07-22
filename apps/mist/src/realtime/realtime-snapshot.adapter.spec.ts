import { toCanonicalSnapshot } from './realtime-snapshot.adapter';
import { RealtimeNativeFrame } from './realtime-native-frame';

describe('realtime provider adapters', () => {
  it.each([
    [
      'tdx',
      'tdx.get_market_snapshot',
      '600030.SH',
      {
        Now: 31.25,
        Open: 31.1,
        Max: 31.4,
        Min: 30.98,
        LastClose: 31,
        Volume: 12,
        Amount: 20,
        DateTime: '2026-07-22 10:01:02',
      },
    ],
    [
      'qmt',
      'qmt.get_full_tick',
      '300502.SZ',
      {
        lastPrice: 541.2,
        open: 535,
        high: 545.5,
        low: 532.1,
        lastClose: 536.8,
        volume: 12,
        amount: 20,
        timetag: '20260722 10:01:02',
      },
    ],
  ] as const)(
    'adapts %s native data at the backend boundary',
    (source, acquisitionProfile, symbol, native) => {
      const frame: RealtimeNativeFrame = {
        payloadType: 'mist.realtime.native_snapshot',
        schemaVersion: 1,
        source,
        acquisitionProfile,
        streamEpoch: 'epoch-1',
        sequence: 1,
        sequenceScope: 'symbol',
        symbol,
        capturedAt: '2026-07-22T10:01:02.500+08:00',
        native,
      };

      const result = toCanonicalSnapshot(frame);
      expect(result.prices.last).toBe(source === 'tdx' ? 31.25 : 541.2);
      expect(result.eventTime).toBe('2026-07-22T10:01:02+08:00');
      expect(result.native).toEqual(native);
    },
  );
});
