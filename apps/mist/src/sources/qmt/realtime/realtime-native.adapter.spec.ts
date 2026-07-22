import { toQmtCanonicalSnapshot } from './realtime-native.adapter';
import { QmtNativeSnapshot, QmtRealtimeSnapshotFrame } from './realtime.types';

describe('QMT realtime native adapter', () => {
  it('preserves native data and maps canonical fields at the source boundary', () => {
    const native: QmtNativeSnapshot = {
      timetag: '20260722 10:01:02',
      lastPrice: 541.2,
      open: 535,
      high: 545.5,
      low: 532.1,
      lastClose: 536.8,
      volume: 12,
      amount: 20,
    };
    const result = toQmtCanonicalSnapshot(frame(native));

    expect(result.prices.last).toBe(541.2);
    expect(result.eventTime).toBe('2026-07-22T10:01:02+08:00');
    expect(result.native).toEqual(native);
    expect(result.native).not.toBe(native);
  });
});

function frame(native: QmtNativeSnapshot): QmtRealtimeSnapshotFrame {
  return {
    payloadType: 'mist.realtime.native_snapshot',
    schemaVersion: 1,
    source: 'qmt',
    acquisitionProfile: 'qmt.get_full_tick',
    streamEpoch: 'epoch-1',
    sequence: 1,
    sequenceScope: 'symbol',
    symbol: '300502.SZ',
    capturedAt: '2026-07-22T10:01:02.500+08:00',
    native,
  };
}
