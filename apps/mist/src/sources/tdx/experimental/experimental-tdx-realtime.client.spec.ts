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
  function makeClient(
    allowlist: string[] = ['600519.SH'],
    desiredPoster: jest.Mock = jest.fn().mockResolvedValue(undefined),
  ) {
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
      desiredPoster,
    );
    return { client, store, desiredPoster };
  }

  function readyData(
    currentStreamEpoch: string | null = 'epoch-1',
    currentGeneration: number | null = 1,
  ) {
    return {
      mode: 'builtin_experimental',
      payloadType: 'tdx.realtime.snapshot',
      schemaVersion: 0,
      draftRevision: 1,
      acquisitionProfile: 'tdx.get_market_snapshot',
      currentStreamEpoch,
      currentGeneration,
      ownerId: currentStreamEpoch === null ? null : 'owner-a',
      datasourceBuildId: 'datasource-a',
      bridgeBuildId: currentStreamEpoch === null ? null : 'build-a',
    };
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
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
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
          currentGeneration: 1,
        },
      }),
    );
    await handleMessage(client, makeSnapshotData());
    expect(store.readDebug('600519.SH')?.lastSequence).toBe(1);
  });

  it('keeps the validated frame object instead of rebuilding it', () => {
    const { client } = makeClient();
    const data = makeSnapshotData();

    const validation = (client as any).validateFrame(data);

    expect(validation.frame).toBe(data);
  });

  it('rejects contract tuple mismatch (schemaVersion)', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: readyData(),
      }),
    );
    await handleMessage(client, makeSnapshotData({ schemaVersion: 99 }));
    expect(store.readDebug('600519.SH')).toBeNull();
    expect(store.getDropCount('contractMismatch')).toBe(1);
    expect(store.getRuntimeMetadata().lastError?.code).toBe(
      'TDX_EXPERIMENTAL_CONTRACT_MISMATCH',
    );
  });

  it('rejects missing last price (not filled with 0)', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
          currentGeneration: 1,
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
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
          currentGeneration: 1,
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
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
          currentGeneration: 1,
        },
      }),
    );
    await handleMessage(client, makeSnapshotData({ symbol: '999999.SZ' }));
    expect(store.readDebug('999999.SZ')).toBeNull();
    expect(store.getDropCount('symbolNotAuthorized')).toBe(1);
  });

  it('rejects snapshot with epoch mismatch', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-1',
          currentGeneration: 1,
        },
      }),
    );
    await handleMessage(
      client,
      makeSnapshotData({ streamEpoch: 'different-epoch', sequence: 1 }),
    );
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it('rejects ready with epoch but missing generation (atomic pairing)', async () => {
    const { client, store } = makeClient();
    // ready has epoch but no generation — must reject, not set lastGeneration=null.
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-4',
          // currentGeneration intentionally MISSING
        },
      }),
    );
    // Store should be cleared (no epoch established).
    expect(store.currentStreamEpoch).toBeNull();
  });

  it('rejects stale stream_started after ready with generation baseline', async () => {
    const { client, store } = makeClient();
    // Establish generation baseline = 4.
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'ready',
        data: {
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'epoch-4',
          currentGeneration: 4,
        },
      }),
    );
    // Stale stream_started with generation=1 → must reject.
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'stream_started',
        data: {
          streamEpoch: 'stale-epoch',
          generation: 1,
          mode: 'builtin_experimental',
          ownerId: 'stale-owner',
          bridgeBuildId: 'stale-build',
        },
      }),
    );
    expect(store.currentStreamEpoch).toBe('epoch-4'); // not stale-epoch
  });

  it('rejects an incomplete stream_started without partial metadata updates', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData() }),
    );

    await (client as any).handleMessage(
      JSON.stringify({
        type: 'stream_started',
        data: {
          streamEpoch: 'epoch-2',
          generation: 2,
          mode: 'builtin_experimental',
          ownerId: 'owner-b',
          // bridgeBuildId intentionally missing
        },
      }),
    );

    expect(store.currentStreamEpoch).toBe('epoch-1');
    expect(store.getRuntimeMetadata()).toMatchObject({
      ownerId: 'owner-a',
      bridgeBuildId: 'build-a',
      currentGeneration: 1,
    });
    expect(store.getLastDrop()?.errorCode).toBe(
      'TDX_EXPERIMENTAL_STREAM_STARTED_INVALID',
    );
  });

  it('syncs an empty desired set after ready without an owner', async () => {
    const { client, desiredPoster } = makeClient([]);
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData(null, null) }),
    );
    await flushPromises();
    expect(desiredPoster).toHaveBeenCalledWith(
      'http://127.0.0.1:9001/tdx/bridge/desired',
      [],
    );
  });

  it('resyncs desired state after a new stream generation', async () => {
    const { client, desiredPoster, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData() }),
    );
    await flushPromises();
    desiredPoster.mockClear();
    await (client as any).handleMessage(
      JSON.stringify({
        type: 'stream_started',
        data: {
          streamEpoch: 'epoch-2',
          generation: 2,
          mode: 'builtin_experimental',
          ownerId: 'owner-b',
          bridgeBuildId: 'build-b',
        },
      }),
    );
    await flushPromises();
    expect(desiredPoster).toHaveBeenCalledWith(
      'http://127.0.0.1:9001/tdx/bridge/desired',
      ['600519.SH'],
    );
    expect(store.getRuntimeMetadata()).toMatchObject({
      ownerId: 'owner-b',
      bridgeBuildId: 'build-b',
      currentGeneration: 2,
    });
  });

  it('retries desired-state publication after a transport failure', async () => {
    jest.useFakeTimers();
    const desiredPoster = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { client } = makeClient(['600519.SH'], desiredPoster);
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData(null, null) }),
    );
    await flushPromises();
    expect(desiredPoster).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(desiredPoster).toHaveBeenCalledTimes(2);
    await client.onModuleDestroy();
    jest.useRealTimers();
  });

  it.each([
    '2026-07-17T14:30+08:00',
    '2026-07-17T14:30:00+08',
    '2026-99-99T99:99:99+99:99',
    '2026-02-30T14:30:00+08:00',
    'not-a-dateTstill+offset',
  ])('rejects non-RFC3339 timestamp %s', async (capturedAt) => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData() }),
    );
    await handleMessage(client, makeSnapshotData({ capturedAt }));
    expect(store.readDebug('600519.SH')).toBeNull();
  });

  it.each([
    ['root extra field', { unexpected: true }],
    [
      'snapshot extra field',
      {
        snapshot: {
          ...makeSnapshotData().snapshot,
          unexpected: true,
        },
      },
    ],
    ['non-object quality', { quality: 'bad' }],
    ['quality extra field', { quality: { stale: true, unexpected: true } }],
    ['quality non-boolean', { quality: { stale: 'true' } }],
  ])('rejects exact-schema violation: %s', async (_label, overrides) => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData() }),
    );
    await handleMessage(client, makeSnapshotData(overrides));
    expect(store.readDebug('600519.SH')).toBeNull();
    expect(store.getDropCount('validationError')).toBe(1);
  });

  it('accepts false quality markers and optional eventTime omission', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage(
      JSON.stringify({ type: 'ready', data: readyData() }),
    );
    const frame = makeSnapshotData({ quality: { stale: false } });
    delete (frame as any).eventTime;
    await handleMessage(client, frame);
    expect(store.readDebug('600519.SH')?.snapshot?.eventTime).toBeNull();
    expect(store.readDebug('600519.SH')?.snapshot?.quality).toEqual({
      stale: false,
    });
  });

  it('counts non-JSON decode failures with a stable code', async () => {
    const { client, store } = makeClient();
    await (client as any).handleMessage('{not-json');
    expect(store.getDropCount('decodeError')).toBe(1);
    expect(store.getLastDrop()?.errorCode).toBe(
      'TDX_EXPERIMENTAL_WS_DECODE_ERROR',
    );
  });
});
