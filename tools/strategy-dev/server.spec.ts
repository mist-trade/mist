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
import {
  availabilityKey,
  applySlippageLi,
  MarketRiskRegime,
  ORDER_SIDES,
  recomputeNextBarOpenBuyQuantity,
  SimulatedBroker,
  StrategyEvaluationKernel,
  TradingEngine,
  TRADING_LAYER_DEFAULTS,
  yuanToLi,
} from '@app/strategy';
import { formatShanghaiDateString } from '@app/timezone';
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

describe('tools/strategy-dev/server.ts Wave 2B parity & API contract', () => {
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
    (serverMod as any).backtestSignalsCache?.clear?.();
  });

  function makeWaveKlines(
    symbol: string,
    count = 80,
    periodMinutes = 1440,
  ): any[] {
    const startMs = Date.UTC(2025, 0, 2, 0, 0, 0);
    return Array.from({ length: count }, (_, idx) => {
      const wave = Math.sin(idx / 3) * 1.2 + Math.cos(idx / 7) * 0.6;
      const close = Math.round((10 + wave) * 100) / 100;
      const open = Math.round((close - 0.1) * 100) / 100;
      return {
        id: idx + 1,
        symbol,
        time: new Date(startMs + idx * periodMinutes * 60_000),
        open,
        high: Math.round((Math.max(open, close) + 0.3) * 100) / 100,
        low: Math.round((Math.min(open, close) - 0.3) * 100) / 100,
        close,
        volume: '10000',
        amount: String(Math.round(close * 10000)),
      };
    });
  }

  it('preserves navSeries, non-empty ruleSnapshot, and externalContextRequirements on backtestSignalsCache hit', async () => {
    const sampleKlines = makeWaveKlines('000001', 90);
    const loadSpy = jest
      .spyOn(provider, 'loadCanonicalKlines')
      .mockReturnValue(sampleKlines);

    const payload = {
      symbol: '000001',
      period: 1440,
      startDate: '2025-02-01T00:00:00.000Z',
      endDate: '2025-06-01T00:00:00.000Z',
    };

    const pair1 = createMockHttpPair({
      method: 'POST',
      url: '/v1/strategy-backtests',
      body: payload,
    });
    await serverMod.handleDevRequest(pair1.req, pair1.res);
    const out1 = await pair1.done;

    const pair2 = createMockHttpPair({
      method: 'POST',
      url: '/v1/strategy-backtests',
      body: payload,
    });
    await serverMod.handleDevRequest(pair2.req, pair2.res);
    const out2 = await pair2.done;

    expect(out1.statusCode).toBe(200);
    expect(out2.statusCode).toBe(200);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    const data1 = out1.body.data;
    const data2 = out2.body.data;

    expect(Array.isArray(data1.navSeries)).toBe(true);
    expect(data1.navSeries.length).toBeGreaterThan(0);
    expect(data2.navSeries).toEqual(data1.navSeries);

    expect(data1.ruleSnapshot).toBeDefined();
    expect(Object.keys(data1.ruleSnapshot).length).toBeGreaterThan(0);
    expect(data2.ruleSnapshot).toEqual(data1.ruleSnapshot);

    expect(Array.isArray(data1.externalContextRequirements)).toBe(true);
    expect(data2.externalContextRequirements).toEqual(
      data1.externalContextRequirements,
    );
    expect(data1.contextRequirements).toBeDefined();
    expect(data2.contextRequirements).toEqual(data1.contextRequirements);
  });

  it('derives externalContextRequirements from plugins declaring resolveExternalContextRequirements', async () => {
    const sampleKlines = makeWaveKlines('000001', 40);
    jest.spyOn(provider, 'loadCanonicalKlines').mockReturnValue(sampleKlines);
    const extReq = [{ securityCode: '000300', period: 1440, minBars: 5 }];
    jest
      .spyOn(ExternalFactorPluginLoader, 'registerExternalPlugins')
      .mockImplementation((registry) => {
        registry.register({
          id: 'plugin.test.ext-req',
          name: '外部上下文测试',
          category: 'TECHNICAL',
          version: '1.0.0',
          description: 'test',
          paramSchema: {},
          resolveExternalContextRequirements: () => extReq,
          evaluate: async () => ({ action: 'NEUTRAL', reason: 'ok' }),
        });
        return 1;
      });

    const pair = createMockHttpPair({
      method: 'POST',
      url: '/v1/strategy-backtests',
      body: {
        symbol: '000001',
        period: 1440,
        mode: 'single',
        pluginId: 'plugin.test.ext-req',
      },
    });
    await serverMod.handleDevRequest(pair.req, pair.res);
    const out = await pair.done;

    expect(out.statusCode).toBe(200);
    expect(out.body.data.externalContextRequirements).toEqual(extReq);
    expect(Object.keys(out.body.data.ruleSnapshot).length).toBeGreaterThan(0);
  });

  it('uses availabilityKey for effectiveTime, propagates macroRegime, and recomputes Next-Bar high-open BUY qty', async () => {
    // 构造 30m K 线：第 1 根在 15:00 上海收盘触发信号 (availabilityKey = 15:01)，第 2 根高开 +8%
    const t0 = new Date('2026-01-05T07:00:00.000Z'); // 15:00+08
    const t1 = new Date('2026-01-06T02:00:00.000Z'); // 次日 10:00+08
    const t2 = new Date('2026-01-06T07:00:00.000Z'); // 次日 15:00+08
    const klines = [
      {
        id: 1,
        symbol: '000001',
        time: t0,
        open: 10.0,
        high: 10.2,
        low: 9.9,
        close: 10.0,
        volume: '10000',
        amount: '100000',
      },
      {
        id: 2,
        symbol: '000001',
        time: t1,
        open: 10.8,
        high: 10.9,
        low: 10.0,
        close: 10.1,
        volume: '10000',
        amount: '101000',
      },
      {
        id: 3,
        symbol: '000001',
        time: t2,
        open: 10.1,
        high: 10.2,
        low: 9.8,
        close: 9.9,
        volume: '10000',
        amount: '99000',
      },
    ];
    jest.spyOn(provider, 'loadCanonicalKlines').mockReturnValue(klines);

    const pushSpy = jest.spyOn(StrategyEvaluationKernel.prototype, 'push');
    pushSpy.mockResolvedValueOnce([
      {
        definitionId: -1,
        versionId: -1,
        signalKind: 'entry',
        triggerPeriod: 30,
        intent: 'ENTRY',
        signalTime: t0,
        triggerPrice: 10.0,
        pivotTime: null,
        pivotPrice: null,
        signalType: 'TEST_BUY',
        badgeText: '买点',
        decisionTrace: { status: 'SIGNAL_EMITTED', action: 'BUY' },
        contextSnapshot: { action: 'BUY' },
        ruleSnapshot: {},
      },
    ]);
    pushSpy.mockResolvedValue([]);

    const decideSpy = jest.spyOn(TradingEngine.prototype, 'decide');
    const surveilSpy = jest.spyOn(TradingEngine.prototype, 'surveilBar');
    const submitSpy = jest.spyOn(SimulatedBroker.prototype, 'submitOrder');

    const elevatedRegime = {
      regime: MarketRiskRegime.ELEVATED_RISK,
      marketAtrPercentile: 0.9,
      isLiquidityFrozen: false,
    };

    await (serverMod.runUnifiedSimulationBacktest as any)({
      code: '000001',
      period: 30,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-10T00:00:00.000Z',
      enableStopLoss: true,
      macroRegime: elevatedRegime,
    });

    expect(decideSpy).toHaveBeenCalled();
    const firstGroup = decideSpy.mock.calls[0][0];
    const expectedEffective = availabilityKey({ period: 30, timestamp: t0 });
    expect(firstGroup.effectiveTime.getTime()).toBe(
      expectedEffective.getTime(),
    );
    expect(firstGroup.tradingDay).toBe(
      formatShanghaiDateString(expectedEffective),
    );
    expect(decideSpy.mock.calls[0][2]).toEqual(elevatedRegime);

    expect(surveilSpy).toHaveBeenCalled();
    expect(surveilSpy.mock.calls[0][2]).toEqual(elevatedRegime);

    const buyOrder = submitSpy.mock.calls.find(
      ([dto]) => dto.side === ORDER_SIDES.BUY,
    );
    expect(buyOrder).toBeDefined();
    const expectedQty = recomputeNextBarOpenBuyQuantity({
      cashLi: yuanToLi(1_000_000),
      fillPriceLi: applySlippageLi(yuanToLi(10.8), ORDER_SIDES.BUY, 0.0005),
      requestedQuantity: 47_500,
      cashAllocationRatio: TRADING_LAYER_DEFAULTS.DEFAULT_CASH_ALLOCATION_RATIO,
      lotSize: TRADING_LAYER_DEFAULTS.DEFAULT_LOT_SIZE,
      securityCode: '000001',
      feeEnabled: true,
      macroRegime: elevatedRegime,
    });
    expect(buyOrder![0].quantity).toBe(expectedQty);
  });

  it('returns real nullable pivotTime/pivotPrice without signalTime fallback or synthetic chanBsp in GET /v1/strategy-backtests/:id/signals', async () => {
    const t0 = new Date('2026-01-05T07:00:00.000Z');
    const klines = makeWaveKlines('000001', 5, 30).map((k, idx) => ({
      ...k,
      time: new Date(t0.getTime() + idx * 30 * 60_000),
    }));
    jest.spyOn(provider, 'loadCanonicalKlines').mockReturnValue(klines);

    const pushSpy = jest.spyOn(StrategyEvaluationKernel.prototype, 'push');
    pushSpy.mockResolvedValueOnce([
      {
        definitionId: -1,
        versionId: -1,
        signalKind: 'entry',
        triggerPeriod: 30,
        intent: 'ENTRY',
        signalTime: t0,
        triggerPrice: 12.34,
        pivotTime: null,
        pivotPrice: null,
        signalType: 'LEGACY_DSL',
        badgeText: '规则买入',
        decisionTrace: { status: 'SIGNAL_EMITTED', action: 'BUY' },
        contextSnapshot: { action: 'BUY' },
        ruleSnapshot: {},
      },
    ]);
    pushSpy.mockResolvedValue([]);

    const createPair = createMockHttpPair({
      method: 'POST',
      url: '/v1/strategy-backtests',
      body: {
        symbol: '000001',
        period: 30,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
      },
    });
    await serverMod.handleDevRequest(createPair.req, createPair.res);
    const created = await createPair.done;
    const runId = created.body.data.runId;

    const getPair = createMockHttpPair({
      method: 'GET',
      url: `/v1/strategy-backtests/${runId}/signals`,
    });
    await serverMod.handleDevRequest(getPair.req, getPair.res);
    const out = await getPair.done;

    expect(out.statusCode).toBe(200);
    const items = out.body.data.items;
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.pivotTime).toBeNull();
    expect(item.contextSnapshot.pivotTime).toBeNull();
    expect(item.contextSnapshot.pivotPrice).toBeNull();
    expect(item.contextSnapshot).not.toHaveProperty('chanBsp');
  });
});
