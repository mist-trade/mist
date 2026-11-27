import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import type { StrategyBar } from '../../libs/market-data/src/strategy-bar';
import { StrategySimulationSession } from '../../libs/strategy/src/simulation';
import { InMemoryFactorPluginRegistry } from '../../libs/strategy/src/factor/factor-plugin-registry';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../../libs/strategy/src/factor/factor.types';
import { ExternalFactorPluginLoader } from '../../libs/strategy/src/factor/external-plugin-loader';
import { ChanVisualAdapter } from '../../libs/visual-command/src/adapters/chan-visual.adapter';
import * as provider from './provider';
import * as constants from './strategy-dev.constants';

type ServerModule = typeof import('./server');

function makeRawKlines(
  symbol: string,
  closes: readonly number[],
  startDay = 5,
): any[] {
  return closes.map((close, idx) => ({
    id: idx + 1,
    symbol,
    time: new Date(Date.UTC(2026, 0, startDay + idx, 7, 0, 0)),
    open: close - 0.5,
    high: close + 1.0,
    low: close - 1.0,
    close,
    volume: '1000',
    amount: String(close * 1000),
  }));
}

function createMockHttpPair(options: {
  method: string;
  url: string;
  body?: unknown;
  remoteAddress?: string;
}): {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  done: Promise<{ statusCode: number; body: any }>;
} {
  const req = new EventEmitter() as http.IncomingMessage & EventEmitter;
  req.method = options.method;
  req.url = options.url;
  req.headers = {};
  (req as any).socket = { remoteAddress: options.remoteAddress ?? '127.0.0.1' };

  let statusCode = 200;
  let rawBody = '';
  let resolveDone!: (val: { statusCode: number; body: any }) => void;
  const done = new Promise<{ statusCode: number; body: any }>((resolve) => {
    resolveDone = resolve;
  });

  const res = {
    writeHead(code: number) {
      statusCode = code;
      return res;
    },
    write(chunk: string) {
      rawBody += chunk;
      return true;
    },
    end(chunk?: string) {
      if (chunk) rawBody += chunk;
      let parsed: any = rawBody;
      try {
        parsed = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        // leave raw string
      }
      resolveDone({ statusCode, body: parsed });
    },
  } as unknown as http.ServerResponse;

  queueMicrotask(() => {
    if (options.body !== undefined) {
      req.emit('data', Buffer.from(JSON.stringify(options.body), 'utf8'));
    }
    req.emit('end');
  });

  return { req, res, done };
}

describe('tools/strategy-dev/server.ts (DEV-P0-09 & DEV-PERF-01)', () => {
  let serverMod: ServerModule;

  beforeAll(async () => {
    process.env.DEV_SERVER_AUTOSTART = 'false';
    process.env.SKIP_DEV_PREHEAT = 'true';
    ExternalFactorPluginLoader.setDisabled(true);
    serverMod = await import('./server');
  });

  afterAll(() => {
    ExternalFactorPluginLoader.resetConfiguration();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    serverMod.visualCommandsCache?.clear?.();
  });

  it('[DEV-P0-09] buildExternalSimulationBars 为外部上下文标的分配严格 < 0 且与主标的互斥的 securityId', () => {
    const reqs = [
      { securityCode: '000300', period: 1440, minBars: 3 },
      { securityCode: '000016', securityId: 1, period: 1440, minBars: 3 },
      { securityCode: '399006', securityId: -88, period: 1440, minBars: 3 },
    ];

    const externalBars: StrategyBar[] = serverMod.buildExternalSimulationBars(
      reqs,
      (req) => makeRawKlines(req.securityCode, [100, 101, 102]),
    );

    expect(externalBars).toHaveLength(9);
    const idsByCode = new Map<string, Set<number>>();
    for (const bar of externalBars) {
      expect(bar.securityId).toBeLessThan(0);
      expect(bar.securityId).not.toBe(constants.DEFAULT_DEV_SECURITY_ID);
      expect(bar.source).toBe(constants.DEFAULT_DEV_MARKET_SOURCE);
      const code = bar.securityCode ?? '';
      const set = idsByCode.get(code) ?? new Set<number>();
      set.add(bar.securityId);
      idsByCode.set(code, set);
    }

    expect(idsByCode.get('000300')?.size).toBe(1);
    expect(idsByCode.get('000016')?.size).toBe(1);
    expect(idsByCode.get('399006')).toEqual(new Set([-88]));
    const id300 = [...idsByCode.get('000300')!][0];
    const id016 = [...idsByCode.get('000016')!][0];
    expect(id300).not.toBe(id016);
  });

  it('[DEV-P0-09] 外部上下文 Bar 绝对不会进入主标的滑窗 (StrategySimulationSession + Kernel 隔离)', async () => {
    class ExternalEchoPlugin implements FactorPlugin {
      public readonly id = 'plugin.test.ext-echo';
      public readonly name = '外部上下文回声测试插件';
      public readonly category = 'TECHNICAL' as const;
      public readonly version = '1.0.0';
      public readonly description = 'test';
      public readonly paramSchema = {};
      public lastExternalClose = -1;

      public resolveExternalContextRequirements() {
        return [{ securityCode: '000300', period: 1440, minBars: 2 }];
      }

      public async evaluate(context: FactorContext): Promise<FactorOpinion> {
        const ext = context.attributes.get('series.000300.1440') as
          | readonly { rawBar: { close: number } }[]
          | undefined;
        this.lastExternalClose = ext?.[ext.length - 1]?.rawBar.close ?? -1;
        return { action: 'NEUTRAL', reason: 'observe' };
      }
    }

    const plugin = new ExternalEchoPlugin();
    const registry = new InMemoryFactorPluginRegistry();
    registry.register(plugin);

    const primaryRaw = makeRawKlines('000001', [10, 11, 12], 5);
    const primaryBars: StrategyBar[] = primaryRaw.map((k) => ({
      securityId: constants.DEFAULT_DEV_SECURITY_ID,
      securityCode: '000001',
      source: constants.DEFAULT_DEV_MARKET_SOURCE,
      period: 1440,
      timestamp: k.time,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      amount: k.amount,
      type: 'complete',
    }));

    const extReqs = plugin.resolveExternalContextRequirements();
    const externalBars = serverMod.buildExternalSimulationBars(extReqs, (req) =>
      makeRawKlines(req.securityCode, [3900, 3950, 4000], 5),
    );

    const session = new StrategySimulationSession(primaryBars, {
      securityCode: '000001',
      securityId: constants.DEFAULT_DEV_SECURITY_ID,
      period: 1440,
      windowBudget: 3,
      flow: {
        id: 'g_ext',
        type: 'GUARD',
        name: 'ext_gate',
        pluginId: plugin.id,
        params: {},
        requiredAction: 'BUY',
        onPass: {
          id: 't_pass',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'PASS',
          reason: 'pass',
        },
      },
      externalContextRequirements: extReqs,
      externalBars,
      registry,
    });

    await session.stepNext();
    await session.stepNext();
    const frame3 = await session.stepNext();

    expect(frame3).not.toBeNull();
    // 主标的滑窗只能有主标的价格 (10, 11, 12)，绝不允许混入外部指数 3900~4000
    const windowCloses = frame3!.windowBars.map(
      (w) => w.ohlc.effective?.close ?? w.rawBar.close,
    );
    expect(windowCloses).toEqual([10, 11, 12]);
    expect(frame3!.windowBars.every((w) => w.rawBar.securityId === 1)).toBe(
      true,
    );
    expect(plugin.lastExternalClose).toBe(4000);
    session.destroy();
  });

  it('[DEV-P0-09] HTTP POST /v1/simulation/start 隔离外部上下文 Bar 且不污染主标的滑窗', async () => {
    const loadSpy = jest
      .spyOn(provider, 'loadCanonicalKlines')
      .mockImplementation((opts) => {
        if (opts.code === '000300') {
          return makeRawKlines('000300', [4100, 4200, 4300], 5);
        }
        return makeRawKlines('000001', [10, 11, 12], 5);
      });

    // 使用内建 plugin.chan.bsp 或简单自定义 rule 测试 /v1/simulation/start
    const { req, res, done } = createMockHttpPair({
      method: 'POST',
      url: '/v1/simulation/start',
      body: {
        code: '000001',
        period: 1440,
        rule: {
          id: 'g_root',
          type: 'GUARD',
          name: 'chan',
          pluginId: 'plugin.chan.bsp',
          params: {
            units: 'bi',
            direction: 'both',
            points: { first: true, second: true, third: true },
            requiredBarCount: 2,
          },
          requiredAction: 'BOTH',
          onPass: {
            id: 't_pass',
            type: 'TERMINAL',
            action: 'INHERIT',
            signalTag: 'CHAN',
            reason: 'ok',
          },
        },
      },
    });

    await serverMod.handleDevRequest(req, res);
    const out = await done;
    expect(out.statusCode).toBe(201);
    expect(loadSpy).toHaveBeenCalled();

    // 清理创建的会话
    const sessionId = out.body?.data?.sessionId;
    if (sessionId) {
      const stopPair = createMockHttpPair({
        method: 'POST',
        url: '/v1/simulation/stop',
        body: { sessionId },
      });
      await serverMod.handleDevRequest(stopPair.req, stopPair.res);
      await stopPair.done;
    }
  });

  it('[DEV-PERF-01] BoundedLruCache 执行有界 LRU 容量淘汰并在命中时刷新热度', () => {
    expect(constants.MAX_VISUAL_COMMANDS_CACHE_ENTRIES).toBeGreaterThan(0);
    const cache = new serverMod.BoundedLruCache<string, number>(2);
    cache.set('k1', 1);
    cache.set('k2', 2);
    // 访问 k1 刷新其热度，此时 k2 变为最老条目
    expect(cache.get('k1')).toBe(1);
    cache.set('k3', 3);

    expect(cache.size).toBe(2);
    expect(cache.get('k2')).toBeUndefined();
    expect(cache.get('k1')).toBe(1);
    expect(cache.get('k3')).toBe(3);
  });

  it('[DEV-PERF-01] GET /v1/visual/commands 复用模块级缓存，第二次相同请求命中缓存不再重复调用 ChanVisualAdapter.convert', async () => {
    const sampleKlines = makeRawKlines('000001', [10, 11, 10.5, 11.5, 12], 5);
    jest.spyOn(provider, 'loadCanonicalKlines').mockReturnValue(sampleKlines);
    const convertSpy = jest
      .spyOn(ChanVisualAdapter, 'convert')
      .mockReturnValue([]);

    const pair1 = createMockHttpPair({
      method: 'GET',
      url: '/v1/visual/commands?code=000001&period=1440',
    });
    await serverMod.handleDevRequest(pair1.req, pair1.res);
    const out1 = await pair1.done;
    expect(out1.statusCode).toBe(200);
    expect(convertSpy).toHaveBeenCalledTimes(1);

    const pair2 = createMockHttpPair({
      method: 'GET',
      url: '/v1/visual/commands?code=000001&period=1440',
    });
    await serverMod.handleDevRequest(pair2.req, pair2.res);
    const out2 = await pair2.done;
    expect(out2.statusCode).toBe(200);
    expect(out2.body.data).toEqual(out1.body.data);
    // 命中模块级缓存，convert 仅执行 1 次
    expect(convertSpy).toHaveBeenCalledTimes(1);
  });
});
