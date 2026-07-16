import { ExperimentalTdxRealtimeClient } from './experimental-tdx-realtime.client';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';

/**
 * Tests for the strict frame validation in ExperimentalTdxRealtimeClient.
 * We test the validation logic via the handleMessage path by feeding WS
 * message JSON strings. The client's validateFrame is private, but
 * handleMessage exercises it end-to-end.
 */
describe('ExperimentalTdxRealtimeClient strict validation', () => {
  function makeClient(allowlist: string[] = ['600519.SH']) {
    const configService = {
      get: (key: string, def?: unknown) => {
        if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
        if (key === 'TDX_WS_CLIENT_ID') return 'test-client';
        if (key === 'TDX_WS_RECONNECT_DELAY_MS') return 9999;
        if (key === 'TDX_EXPERIMENTAL_ALLOWLIST') return allowlist.join(',');
        return def;
      },
    } as any;
    const store = new InMemoryRealtimeStore();
    // Stub allowlist: isAuthorized returns true for entries.
    const allowlistResolver = {
      isAuthorized: (sym: string) => allowlist.includes(sym),
      resolve: (sym: string) =>
        allowlist.includes(sym) ? { formatCode: sym, securityId: 1 } : null,
      entriesList: allowlist.map((f) => ({ formatCode: f, securityId: 1 })),
    } as unknown as ExperimentalAllowlistResolver;
    const client = new ExperimentalTdxRealtimeClient(
      configService,
      store,
      allowlistResolver,
    );
    return { client, store };
  }

  function makeSnapshotData(overrides: Record<string, unknown> = {}) {
    return {
      payloadType: 'tdx.realtime.snapshot',
      schemaVersion: 0,
      draftRevision: 1,
      contractStatus: 'experimental',
      acquisitionProfile: 'tdx.get_market_snapshot',
      streamEpoch: 'epoch-1',
      sequence: 1,
      symbol: '600519.SH',
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

  // Access private handleMessage via casting.
  function handleMessage(client: any, data: Record<string, unknown>) {
    const msg = JSON.stringify({ type: 'tdx.experimental.snapshot', data });
    return (client as any).handleMessage(msg);
  }

  it('accepts a valid snapshot after ready establishes epoch', async () => {
    const { client, store } = makeClient();
    // Simulate ready.
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
        },
      }),
    );
    await handleMessage(client, makeSnapshotData());
    expect(store.readDebug('600519.SH')?.lastSequence).toBe(1);
  });

  it('rejects contract tuple mismatch (schemaVersion)', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: { currentStreamEpoch: 'epoch-1' },
      }),
    );
    await handleMessage(client, makeSnapshotData({ schemaVersion: 99 }));
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it('rejects missing last price (not filled with 0)', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
        },
      }),
    );
    const bad = makeSnapshotData();
    delete (bad.snapshot as any).last;
    await handleMessage(client, bad);
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it('rejects NaN last price', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
        },
      }),
    );
    const bad = makeSnapshotData({
      snapshot: {
        last: NaN,
        open: 1,
        high: 2,
        low: 0,
        lastClose: 1,
        nativeVolume: null,
        nativeAmount: null,
      },
    });
    await handleMessage(client, bad);
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it('rejects snapshot for symbol not in allowlist', async () => {
    const { client, store } = makeClient(['600519.SH']);
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
        },
      }),
    );
    await handleMessage(client, makeSnapshotData({ symbol: '999999.SZ' }));
    expect(store.readDebug('999999.SZ')).toBeNull();
  });

  it('rejects snapshot with epoch mismatch', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
        },
      }),
    );
    await handleMessage(
      client,
      makeSnapshotData({ streamEpoch: 'different-epoch', sequence: 1 }),
    );
    expect(store.readDebug('600519.SH')).toBeNull();
  });
});
