import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { ExperimentalQmtRealtimeClient } from './experimental-qmt-realtime.client';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

const EPOCH = 'epoch-qmt-1';

function setup() {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'QMT_BASE_URL') return 'http://127.0.0.1:9002';
      if (key === 'QMT_WS_CLIENT_ID') return 'qmt-test';
      return fallback;
    }),
  } as unknown as ConfigService;
  const store = new InMemoryQmtRealtimeStore();
  const allowlist = {
    entriesList: [{ formatCode: '600519.SH', securityId: 7 }],
    isAuthorized: (symbol: string) => symbol === '600519.SH',
  };
  const client = new ExperimentalQmtRealtimeClient(
    config,
    store,
    allowlist as never,
  );
  const send = jest.fn();
  (client as any).ws = { readyState: WebSocket.OPEN, send };
  return { client, store, send };
}

function emit(
  client: ExperimentalQmtRealtimeClient,
  type: string,
  data: object,
) {
  (client as any).handleMessage(
    JSON.stringify({ type, provider: 'qmt', data }),
  );
}

function contract() {
  return {
    payloadType: 'qmt.experimental.snapshot',
    schemaVersion: 0,
    draftRevision: 1,
    acquisitionProfile: 'qmt.get_full_tick.v0',
  };
}

function readyData() {
  return {
    ...contract(),
    mode: 'builtin_experimental',
    streamEpoch: EPOCH,
    sequence: 0,
    ownerGeneration: 0,
    ownerId: null,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ...contract(),
    streamEpoch: EPOCH,
    sequence: 1,
    symbol: '600519.SH',
    capturedAt: new Date().toISOString(),
    native: {
      timetag: '20260718100000',
      lastPrice: 1500,
      open: 1490,
      high: 1510,
      low: 1480,
      lastClose: 1495,
      volume: 100,
      amount: 150000,
    },
    ...overrides,
  };
}

describe('ExperimentalQmtRealtimeClient', () => {
  it('accepts ready and publishes the complete desired set', () => {
    const { client, store, send } = setup();
    emit(client, 'ready', readyData());

    expect(store.status()).toMatchObject({
      connected: true,
      currentStreamEpoch: EPOCH,
      lastSequence: 0,
    });
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'sync_subscriptions',
        symbols: ['600519.SH'],
      }),
    );
  });

  it('accepts only authorized, current, strictly increasing frames', () => {
    const { client, store } = setup();
    emit(client, 'ready', readyData());
    emit(client, 'qmt.experimental.snapshot', snapshot());
    expect(store.read('600519.SH')?.snapshot.native.lastPrice).toBe(1500);

    emit(client, 'qmt.experimental.snapshot', snapshot());
    emit(
      client,
      'qmt.experimental.snapshot',
      snapshot({ sequence: 2, symbol: '000001.SZ' }),
    );
    expect(store.status().dropCounts).toMatchObject({
      duplicate: 1,
      symbolNotAuthorized: 1,
    });
  });

  it('rejects malformed, stale, wrong-epoch, and unknown-contract frames', () => {
    const { client, store } = setup();
    emit(client, 'ready', readyData());
    emit(client, 'qmt.experimental.snapshot', snapshot({ extra: true }));
    emit(
      client,
      'qmt.experimental.snapshot',
      snapshot({ capturedAt: '2020-01-01T00:00:00Z' }),
    );
    emit(
      client,
      'qmt.experimental.snapshot',
      snapshot({ streamEpoch: 'stale-epoch' }),
    );
    emit(client, 'qmt.experimental.snapshot', snapshot({ schemaVersion: 2 }));
    expect(store.status().dropCounts).toMatchObject({
      validationError: 1,
      stale: 1,
      epochMismatch: 1,
      contractMismatch: 1,
    });
  });

  it('resets fencing and republishes desired state after an epoch change', () => {
    const { client, store, send } = setup();
    emit(client, 'ready', readyData());
    emit(client, 'qmt.experimental.snapshot', snapshot());
    emit(client, 'stream_started', {
      ...contract(),
      mode: 'builtin_experimental',
      streamEpoch: 'epoch-qmt-2',
      ownerGeneration: 2,
      ownerId: 'qmt-owner-2',
      sequence: 0,
    });

    expect(store.status()).toMatchObject({
      currentStreamEpoch: 'epoch-qmt-2',
      lastSequence: 0,
      activeSymbolCount: 0,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('rejects stale owner generation transitions', () => {
    const { client, store } = setup();
    emit(client, 'ready', readyData());
    emit(client, 'stream_started', {
      ...contract(),
      mode: 'builtin_experimental',
      streamEpoch: 'epoch-qmt-2',
      ownerGeneration: 2,
      ownerId: 'owner-2',
      sequence: 0,
    });
    emit(client, 'stream_started', {
      ...contract(),
      mode: 'builtin_experimental',
      streamEpoch: 'stale-epoch',
      ownerGeneration: 1,
      ownerId: 'owner-1',
      sequence: 0,
    });
    expect(store.currentEpoch).toBe('epoch-qmt-2');
    expect(store.status().dropCounts).toMatchObject({ validationError: 1 });
  });
});
