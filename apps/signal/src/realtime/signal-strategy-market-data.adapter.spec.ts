import { DataSource, K, Period, Security } from '@app/shared-data';
import type Redis from 'ioredis';
import type { Repository } from 'typeorm';
import type { SplicePolicy } from '@app/market-data';
import { SignalRealtimeRedisService } from './signal-realtime-redis.service';
import { SignalStrategyMarketDataAdapter } from './signal-strategy-market-data.adapter';

// canonical policy 测试桩：1m/5m 单段 tdx（历史段走 canonical 段读取）
const TEST_POLICY = {
  version: 'adapter-spec-v1',
  defaults: {
    '1': [{ source: 'tdx' }],
    '5': [{ source: 'tdx' }],
  },
} as unknown as SplicePolicy;
jest.mock('@app/strategy', () => ({
  ...jest.requireActual('@app/strategy'),
  CanonicalPolicyLoader: {
    load: () => TEST_POLICY,
    setCustomPaths: jest.fn(),
    resetConfiguration: jest.fn(),
  },
}));

describe('SignalStrategyMarketDataAdapter', () => {
  it('resolves one exact sealed Redis record into a canonical 1m bar', async () => {
    const redis = fakeRedis({ hget: JSON.stringify(record(10.5)) });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository({}),
      redis.service,
    );

    await expect(
      adapter.resolveRealtimeObservation({
        securityId: 9,
        source: 'tdx',
        period: 1,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        outcome: 'sealed',
      }),
    ).resolves.toEqual({
      outcome: 'sealed',
      bar: {
        securityId: 9,
        source: 'tdx',
        period: 1,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        open: 10.5,
        high: 10.5,
        low: 10.5,
        close: 10.5,
        volume: '100',
        amount: '200',
        type: 'complete',
      },
    });
    expect(redis.client.hget).toHaveBeenCalledWith(
      'mist:realtime:v1:day:20260804:tdx:9:candle:1m:closed',
      String(Date.parse('2026-08-04T01:30:00.000Z')),
    );
  });

  it('hydrates one canonical-history + current-day window with the anchor excluded', async () => {
    const anchor = new Date('2026-08-04T01:32:00.000Z');
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T01:30:00.000Z'))]: JSON.stringify(
          record(10),
        ),
        [String(Date.parse('2026-08-04T01:31:00.000Z'))]: JSON.stringify(
          record(11),
        ),
        [String(Date.parse('2026-08-04T01:32:00.000Z'))]: JSON.stringify(
          record(12),
        ),
      },
    });
    const rows = [historicalK('2026-08-03T01:30:00.000Z')];
    const kRepository = repository({ rows });
    const adapter = new SignalStrategyMarketDataAdapter(
      kRepository,
      redis.service,
    );

    const result = await adapter.loadRealtimeWindow({
      securityId: 9,
      source: 'tdx',
      period: 1,
      anchorAt: anchor,
      anchorAvailabilityMs: anchor.getTime() + 60_000,
      requiredBars: 3,
    });

    expect(result.bars.map((bar) => bar.timestamp.toISOString())).toEqual([
      '2026-08-03T01:30:00.000Z',
      '2026-08-04T01:30:00.000Z',
      '2026-08-04T01:31:00.000Z',
    ]);
    expect(result.bars[0].amount).toBe('10000');
    // 历史段走 canonical 段读取（k.source/k.period 谓词），不再按物理源直查
    expect(kRepository.createQueryBuilder).toHaveBeenCalledWith('k');
  });

  it('returns one pre-window same-day bar so quantity projection can seed forward fill', async () => {
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T01:30:00.000Z'))]: JSON.stringify(
          record(10, '80'),
        ),
        [String(Date.parse('2026-08-04T01:31:00.000Z'))]: JSON.stringify(
          record(11, null),
        ),
      },
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository({}),
      redis.service,
    );

    const result = await adapter.loadRealtimeWindow({
      securityId: 9,
      source: 'tdx',
      period: 1,
      anchorAt: new Date('2026-08-04T01:32:00.000Z'),
      anchorAvailabilityMs:
        new Date('2026-08-04T01:32:00.000Z').getTime() + 60_000,
      requiredBars: 2,
    });

    expect(result.bars.map((bar) => bar.volume)).toEqual(['80', null]);
  });

  it('rebuilds an incomplete higher-period bar with a right label from bounded current-day 1m records', async () => {
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T01:30:00.000Z'))]: JSON.stringify(
          record(10),
        ),
        [String(Date.parse('2026-08-04T01:32:00.000Z'))]: JSON.stringify(
          record(12),
        ),
      },
    });
    const kRepository = repository({});
    const adapter = new SignalStrategyMarketDataAdapter(
      kRepository,
      redis.service,
    );

    const result = await adapter.loadRealtimeWindow({
      securityId: 9,
      source: 'tdx',
      period: 5,
      anchorAt: new Date('2026-08-04T01:35:00.000Z'),
      anchorAvailabilityMs:
        new Date('2026-08-04T01:35:00.000Z').getTime() + 60_000,
      requiredBars: 2,
    });

    expect(result.bars).toEqual([
      expect.objectContaining({
        period: 5,
        // 右标：槽 [09:30,09:35) 的标签 = 09:35
        timestamp: new Date('2026-08-04T01:35:00.000Z'),
        open: 10,
        close: 12,
        type: 'incomplete',
      }),
    ]);
  });

  it('propagates malformed Redis record failures without fallback', async () => {
    const redis = fakeRedis({
      hget: JSON.stringify({ ...record(10), v: 100 }),
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository({}),
      redis.service,
    );

    await expect(
      adapter.resolveRealtimeObservation({
        securityId: 9,
        source: 'tdx',
        period: 1,
        timestamp: new Date('2026-08-04T01:30:00.000Z'),
        outcome: 'sealed',
      }),
    ).rejects.toThrow('closed-candle v must be a string or null');
  });

  it('excludes terminal-closed bars from hydration (they arrive via live emission)', async () => {
    // 15:00 CST = 07:00Z 终端桶；hydration anchor = 15:00 触发（avail 15:01）。
    // 终端闭合的 5m bar（avail 15:01）不得注入——它由增量 builder 现场闭合。
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T06:59:00.000Z'))]: JSON.stringify(
          record(40),
        ),
        [String(Date.parse('2026-08-04T07:00:00.000Z'))]: JSON.stringify(
          record(41),
        ),
      },
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository({}),
      redis.service,
    );

    await expect(
      adapter.loadRealtimeWindow({
        securityId: 9,
        source: 'tdx',
        period: 5,
        anchorAt: new Date('2026-08-04T07:00:00.000Z'),
        anchorAvailabilityMs:
          new Date('2026-08-04T07:00:00.000Z').getTime() + 60_000,
        requiredBars: 2,
      }),
    ).resolves.toEqual({ bars: [] });
  });

  it('tolerates a legacy 15:02 dead sealed bar during window load', async () => {
    // Legacy dead-time bar (pre-fix Redis residue) at 15:02 CST = 07:02:00Z.
    const redis = fakeRedis({
      hgetall: {
        [String(Date.parse('2026-08-04T06:59:00.000Z'))]: JSON.stringify(
          record(40),
        ),
        [String(Date.parse('2026-08-04T07:00:00.000Z'))]: JSON.stringify(
          record(41),
        ),
        [String(Date.parse('2026-08-04T07:02:00.000Z'))]: JSON.stringify(
          record(41),
        ),
      },
    });
    const adapter = new SignalStrategyMarketDataAdapter(
      repository({}),
      redis.service,
    );

    await expect(
      adapter.loadRealtimeWindow({
        securityId: 9,
        source: 'tdx',
        period: 5,
        anchorAt: new Date('2026-08-04T07:05:00.000Z'),
        anchorAvailabilityMs:
          new Date('2026-08-04T07:05:00.000Z').getTime() + 60_000,
        requiredBars: 1,
      }),
    ).resolves.toBeDefined();
  });
});

function fakeRedis(options: {
  hget?: string | null;
  hgetall?: Record<string, string>;
}) {
  const client = {
    hget: jest.fn().mockResolvedValue(options.hget ?? null),
    hgetall: jest.fn().mockResolvedValue(options.hgetall ?? {}),
  };
  return {
    client,
    service: new SignalRealtimeRedisService(
      { get: jest.fn() } as never,
      client as unknown as Redis,
    ),
  };
}

function repository(options: { rows?: K[]; code?: string }): Repository<K> {
  const builder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(options.rows ?? []),
    getRawOne: jest.fn().mockResolvedValue({ code: options.code ?? '000001' }),
  };
  return {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    find: jest.fn().mockResolvedValue(options.rows ?? []),
  } as unknown as Repository<K>;
}

function historicalK(timestamp: string): K {
  return Object.assign(new K(), {
    security: Object.assign(new Security(), { id: 9 }),
    source: DataSource.TDX,
    period: Period.ONE_MIN,
    timestamp: new Date(timestamp),
    open: '8.00',
    high: '9.00',
    low: '7.00',
    close: '8.50',
    volume: '10.00000000',
    amount: '10000.00000000',
  });
}

function record(close: number, volume: string | null = '100') {
  return {
    o: close,
    h: close,
    l: close,
    c: close,
    v: volume,
    a: '200',
    cv: '1000',
    ca: '2000',
    cs: null,
    fe: '2026-08-04T01:30:01.000Z',
    le: '2026-08-04T01:30:59.000Z',
    q: 'provisional',
  };
}
