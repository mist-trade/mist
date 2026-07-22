import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QmtRealtimeStore } from '../sources/qmt/realtime/realtime.store';
import { QmtRealtimeClient } from '../sources/qmt/realtime/realtime.client';
import { TdxRealtimeStore } from '../sources/tdx/realtime/realtime.store';
import { TdxRealtimeClient } from '../sources/tdx/realtime/realtime.client';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';

const capturedAt = new Date().toISOString();

describe('formal realtime ingress contract', () => {
  it('pins the shared golden fixture SHA', () => {
    const root = join(process.cwd(), 'test/fixtures/realtime');
    const fixture = readFileSync(join(root, 'realtime-native-frame-v1.json'));
    const expectedSha = readFileSync(
      join(root, 'realtime-native-frame-v1.sha256'),
      'utf8',
    )
      .trim()
      .split(/\s+/)[0];
    expect(createHash('sha256').update(fixture).digest('hex')).toBe(
      expectedSha,
    );
  });

  it('funnels an accepted TDX native frame through the common ingress', async () => {
    const store = new TdxRealtimeStore();
    const ingress = new RealtimeSnapshotIngressService();
    const client = new TdxRealtimeClient(
      new ConfigService({ TDX_BASE_URL: 'http://127.0.0.1:9001' }),
      store,
      { isAuthorized: () => true, entriesList: [] } as never,
      async () => undefined,
      ingress,
    );

    await emit(
      client,
      'realtime.ready',
      ready('tdx', 'tdx.get_market_snapshot'),
    );
    await emit(
      client,
      'realtime.native_snapshot',
      frame('tdx', '600030.SH', 1),
    );

    expect(ingress.read('tdx', '600030.SH')?.prices.last).toBe(31.25);
  });

  it('fences QMT sequences per symbol before the common ingress', async () => {
    const store = new QmtRealtimeStore();
    const ingress = new RealtimeSnapshotIngressService();
    const client = new QmtRealtimeClient(
      new ConfigService({ QMT_BASE_URL: 'http://127.0.0.1:9002' }),
      store,
      { isAuthorized: () => true, entriesList: [] } as never,
      Date.now,
      ingress,
    );

    await emit(client, 'realtime.ready', ready('qmt', 'qmt.get_full_tick'));
    await emit(
      client,
      'realtime.native_snapshot',
      frame('qmt', '300502.SZ', 1),
    );
    await emit(
      client,
      'realtime.native_snapshot',
      frame('qmt', '000001.SZ', 1),
    );
    await emit(
      client,
      'realtime.native_snapshot',
      frame('qmt', '300502.SZ', 1),
    );

    expect(ingress.read('qmt', '300502.SZ')?.prices.last).toBe(541.2);
    expect(ingress.read('qmt', '000001.SZ')?.prices.last).toBe(12.34);
    expect(store.status().dropCounts).toMatchObject({ duplicate: 1 });
  });
});

async function emit(
  client: object,
  type: string,
  data: Record<string, unknown>,
) {
  await (
    client as { handleMessage(raw: string): Promise<void> | void }
  ).handleMessage(JSON.stringify({ type, data }));
}

function ready(source: 'tdx' | 'qmt', acquisitionProfile: string) {
  return {
    mode: 'builtin',
    payloadType: 'mist.realtime.native_snapshot',
    schemaVersion: 1,
    source,
    sequenceScope: 'symbol',
    acquisitionProfile,
    streamEpoch: 'epoch-1',
    generation: 1,
    ownerId: 'owner-1',
    bridgeBuildId: 'bridge-v1',
    sequence: 0,
  };
}

function frame(source: 'tdx' | 'qmt', symbol: string, sequence: number) {
  const tdx = source === 'tdx';
  return {
    payloadType: 'mist.realtime.native_snapshot',
    schemaVersion: 1,
    source,
    sequenceScope: 'symbol',
    acquisitionProfile: tdx ? 'tdx.get_market_snapshot' : 'qmt.get_full_tick',
    streamEpoch: 'epoch-1',
    sequence,
    symbol,
    capturedAt,
    native: tdx
      ? { Now: 31.25, DateTime: '2026-07-22 10:01:02' }
      : {
          timetag: '20260722 10:01:02',
          lastPrice: symbol === '300502.SZ' ? 541.2 : 12.34,
          open: 12,
          high: 13,
          low: 11,
          lastClose: 12,
          volume: 10,
          amount: 100,
        },
  };
}
