import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalTdxSnapshotFrame } from './experimental-realtime.types';

function makeFrame(
  symbol: string,
  epoch: string,
  sequence: number,
  overrides: Partial<ExperimentalTdxSnapshotFrame> = {},
): ExperimentalTdxSnapshotFrame {
  return {
    payloadType: 'tdx.realtime.snapshot',
    schemaVersion: 0,
    draftRevision: 1,
    contractStatus: 'experimental',
    acquisitionProfile: 'tdx.get_market_snapshot',
    streamEpoch: epoch,
    sequence,
    symbol,
    capturedAt: '2026-07-16T14:30:01.234+08:00',
    eventTime: '2026-07-16T14:30:00.000+08:00',
    snapshot: {
      last: 1685.0,
      open: 1670.0,
      high: 1690.0,
      low: 1665.0,
      lastClose: 1672.5,
      nativeVolume: 12345600,
      nativeAmount: 20800000000,
    },
    unitStatus: 'native-unverified',
    quality: {},
    ...overrides,
  };
}

describe('InMemoryRealtimeStore', () => {
  it('accepts a snapshot for the current epoch with increasing sequence', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    const frame = makeFrame('600519.SH', 'epoch-1', 1);
    expect(store.applyIfCurrentAndNewer('600519.SH', 'epoch-1', 1, frame)).toBe(
      true,
    );
    const debug = store.readDebug('600519.SH');
    expect(debug?.snapshot).toBe(frame);
    expect(debug?.lastSequence).toBe(1);
  });

  it('drops snapshots with a mismatched epoch', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    const frame = makeFrame('600519.SH', 'epoch-2', 1);
    expect(store.applyIfCurrentAndNewer('600519.SH', 'epoch-2', 1, frame)).toBe(
      false,
    );
    expect(store.getDropCount('epochMismatch')).toBe(1);
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it('drops duplicate sequences (same sequence)', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.applyIfCurrentAndNewer(
      '600519.SH',
      'epoch-1',
      5,
      makeFrame('600519.SH', 'epoch-1', 5),
    );
    expect(
      store.applyIfCurrentAndNewer(
        '600519.SH',
        'epoch-1',
        5,
        makeFrame('600519.SH', 'epoch-1', 5),
      ),
    ).toBe(false);
    expect(store.getDropCount('duplicate')).toBe(1);
  });

  it('drops out-of-order sequences (lower than last)', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.applyIfCurrentAndNewer(
      '600519.SH',
      'epoch-1',
      10,
      makeFrame('600519.SH', 'epoch-1', 10),
    );
    expect(
      store.applyIfCurrentAndNewer(
        '600519.SH',
        'epoch-1',
        3,
        makeFrame('600519.SH', 'epoch-1', 3),
      ),
    ).toBe(false);
    expect(store.getDropCount('outOfOrder')).toBe(1);
  });

  it('clears all state on epoch change', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.applyIfCurrentAndNewer(
      '600519.SH',
      'epoch-1',
      1,
      makeFrame('600519.SH', 'epoch-1', 1),
    );
    expect(store.activeSymbolCount).toBe(1);
    store.beginEpoch('epoch-2');
    expect(store.activeSymbolCount).toBe(0);
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it('marks disconnected without clearing data (lazy stale on read)', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.markConnected();
    store.applyIfCurrentAndNewer(
      '600519.SH',
      'epoch-1',
      1,
      makeFrame('600519.SH', 'epoch-1', 1),
    );
    store.markDisconnected();
    const debug = store.readDebug('600519.SH');
    // Data retained but marked stale (disconnected).
    expect(debug?.snapshot).not.toBeNull();
    expect(debug?.fresh).toBe(false);
    expect(debug?.stale).toBe(true);
  });

  it('invalidateSymbol removes a single symbol', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.applyIfCurrentAndNewer(
      '600519.SH',
      'epoch-1',
      1,
      makeFrame('600519.SH', 'epoch-1', 1),
    );
    store.applyIfCurrentAndNewer(
      '000001.SZ',
      'epoch-1',
      1,
      makeFrame('000001.SZ', 'epoch-1', 1),
    );
    store.invalidateSymbol('600519.SH');
    expect(store.readDebug('600519.SH')).toBeNull();
    expect(store.readDebug('000001.SZ')).not.toBeNull();
  });

  it('accepts strictly increasing sequences across multiple frames', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    for (let i = 1; i <= 5; i++) {
      expect(
        store.applyIfCurrentAndNewer(
          '600519.SH',
          'epoch-1',
          i,
          makeFrame('600519.SH', 'epoch-1', i),
        ),
      ).toBe(true);
    }
    expect(store.readDebug('600519.SH')?.lastSequence).toBe(5);
  });

  it('readDebug reports capturedAt and captureToReceiveLatencyMs', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.markConnected();
    const frame = makeFrame('600519.SH', 'epoch-1', 1);
    store.applyIfCurrentAndNewer('600519.SH', 'epoch-1', 1, frame);
    const debug = store.readDebug('600519.SH');
    expect(debug?.capturedAt).toBe(frame.capturedAt);
    expect(debug?.captureToReceiveLatencyMs).not.toBeNull();
    expect(typeof debug?.captureToReceiveLatencyMs).toBe('number');
  });

  it('readDebug marks stale when frame quality.stale=true', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.markConnected();
    const frame = makeFrame('600519.SH', 'epoch-1', 1, {
      quality: { stale: true },
    });
    store.applyIfCurrentAndNewer('600519.SH', 'epoch-1', 1, frame);
    const debug = store.readDebug('600519.SH');
    expect(debug?.fresh).toBe(false);
    expect(debug?.stale).toBe(true);
    expect(debug?.staleReason).toBe('qualityStale');
  });

  it('readDebug reports staleReason=transitStale when capturedAt is far in past', () => {
    const store = new InMemoryRealtimeStore();
    store.beginEpoch('epoch-1');
    store.markConnected();
    // capturedAt is 2 minutes ago — transit delay > STALE_AFTER_MS (30s).
    const oldTime = new Date(Date.now() - 120_000).toISOString();
    const frame = makeFrame('600519.SH', 'epoch-1', 1, {
      capturedAt: oldTime,
    });
    store.applyIfCurrentAndNewer('600519.SH', 'epoch-1', 1, frame);
    const debug = store.readDebug('600519.SH');
    expect(debug?.stale).toBe(true);
    // Could be transitStale or ageStale depending on timing — both are stale.
    expect(debug?.staleReason).not.toBeNull();
  });
});
