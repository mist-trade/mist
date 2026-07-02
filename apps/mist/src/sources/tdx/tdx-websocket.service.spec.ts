import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Period } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { KCandleAggregator, CompletedCandle } from './kcandle-aggregator';
import { TdxWebSocketService } from './tdx-websocket.service';

class FakeWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
    setImmediate(() => {
      if (this.readyState === FakeWebSocket.CLOSED) {
        return;
      }
      this.readyState = FakeWebSocket.OPEN;
      this.emit('open');
    });
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

class NonStandardReadyStateWebSocket extends EventEmitter {
  static CONNECTING = 77;
  static OPEN = 88;
  static CLOSED = 99;
  static instances: NonStandardReadyStateWebSocket[] = [];

  readyState = NonStandardReadyStateWebSocket.CONNECTING;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    NonStandardReadyStateWebSocket.instances.push(this);
    setImmediate(() => {
      if (this.readyState === NonStandardReadyStateWebSocket.CLOSED) {
        return;
      }
      this.readyState = NonStandardReadyStateWebSocket.OPEN;
      this.emit('open');
    });
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = NonStandardReadyStateWebSocket.CLOSED;
  }
}

class FakeAggregator extends EventEmitter {
  process = jest.fn();

  emitCandle(candle: CompletedCandle): void {
    this.emit('candle', candle);
  }
}

const configService = (values: Record<string, string | undefined> = {}) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

const timezoneService = {
  getCurrentBeijingTime: jest.fn(() => new Date('2026-06-26T09:31:00+08:00')),
} as unknown as TimezoneService;

const flushSocketOpen = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

const createService = (
  aggregator = new FakeAggregator(),
  webSocketCtor: typeof FakeWebSocket = FakeWebSocket,
): { service: TdxWebSocketService; aggregator: FakeAggregator } => ({
  service: new TdxWebSocketService(
    configService({
      TDX_BASE_URL: 'http://127.0.0.1:9001',
      TDX_WS_CLIENT_ID: 'mist-test',
    }),
    aggregator as unknown as KCandleAggregator,
    timezoneService,
    webSocketCtor as any,
  ),
  aggregator,
});

const socketOf = (service: TdxWebSocketService): FakeWebSocket =>
  (service as any).ws as FakeWebSocket;

const handleMessage = (
  service: TdxWebSocketService,
  payload: unknown,
): void => {
  (service as any).handleMessage(JSON.stringify(payload));
};

describe('TdxWebSocketService normalized bridge', () => {
  afterEach(() => {
    jest.clearAllMocks();
    FakeWebSocket.instances = [];
    NonStandardReadyStateWebSocket.instances = [];
  });

  it('can be resolved by Nest without an injected WebSocket constructor', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TdxWebSocketService,
        { provide: ConfigService, useValue: configService() },
        { provide: KCandleAggregator, useValue: new FakeAggregator() },
        { provide: TimezoneService, useValue: timezoneService },
      ],
    }).compile();

    expect(moduleRef.get(TdxWebSocketService)).toBeInstanceOf(
      TdxWebSocketService,
    );

    await moduleRef.close();
  });

  it('sends sync_subscriptions with the full subscription set after connect', async () => {
    const { service } = createService();
    service.subscribe('600519.SH');
    service.subscribe('000001.SZ');

    await service.onModuleInit();
    await flushSocketOpen();

    expect(JSON.parse(socketOf(service).sent[0])).toEqual({
      type: 'sync_subscriptions',
      stocks: ['600519.SH', '000001.SZ'],
    });

    await service.onModuleDestroy();
  });

  it('sends sync_subscriptions after connect even when no symbols are subscribed', async () => {
    const { service } = createService();

    await service.onModuleInit();
    await flushSocketOpen();

    expect(JSON.parse(socketOf(service).sent[0])).toEqual({
      type: 'sync_subscriptions',
      stocks: [],
    });

    await service.onModuleDestroy();
  });

  it('resends sync_subscriptions after subscribe and unsubscribe changes', async () => {
    const { service } = createService();

    await service.onModuleInit();
    await flushSocketOpen();
    const socket = socketOf(service);

    service.subscribe('600519.SH');
    service.subscribe('000001.SZ');
    service.unsubscribe('600519.SH');

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'sync_subscriptions', stocks: [] },
      { type: 'sync_subscriptions', stocks: ['600519.SH'] },
      { type: 'sync_subscriptions', stocks: ['600519.SH', '000001.SZ'] },
      { type: 'sync_subscriptions', stocks: ['000001.SZ'] },
    ]);

    await service.onModuleDestroy();
  });

  it('resends full sync_subscriptions when datasource sends ready', async () => {
    const { service } = createService();
    service.subscribe('600519.SH');
    service.subscribe('000001.SZ');

    await service.onModuleInit();
    await flushSocketOpen();
    const socket = socketOf(service);
    socket.sent = [];

    handleMessage(service, { type: 'ready', provider: 'tdx' });

    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      {
        type: 'sync_subscriptions',
        stocks: ['600519.SH', '000001.SZ'],
      },
    ]);

    await service.onModuleDestroy();
  });

  it('creates a new socket and resends subscriptions after reconnect', async () => {
    const { service } = createService();
    (service as any).reconnectDelay = 1;
    service.subscribe('600519.SH');

    await service.onModuleInit();
    await flushSocketOpen();
    const firstSocket = socketOf(service);
    firstSocket.sent = [];
    firstSocket.readyState = FakeWebSocket.CLOSED;
    firstSocket.emit('close');

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    await flushSocketOpen();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(JSON.parse(FakeWebSocket.instances[1].sent[0])).toEqual({
      type: 'sync_subscriptions',
      stocks: ['600519.SH'],
    });

    await service.onModuleDestroy();
  });

  it('logs subscribed and unsubscribed acknowledgements with accepted rejected and active symbols', () => {
    const { service } = createService();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).logger = logger;

    handleMessage(service, {
      type: 'subscribed',
      accepted: ['600519.SH'],
      rejected: [{ symbol: '000001.SZ', reason: 'not tradable' }],
      active: ['600519.SH'],
    });
    handleMessage(service, {
      type: 'unsubscribed',
      accepted: ['600519.SH'],
      rejected: [],
      active: [],
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('subscribed accepted=600519.SH active=600519.SH'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('subscribed rejected=000001.SZ:not tradable'),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('unsubscribed accepted=600519.SH active='),
    );
  });

  it('logs canonical data-based subscription acknowledgements', () => {
    const { service } = createService();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).logger = logger;

    handleMessage(service, {
      type: 'subscribed',
      provider: 'tdx',
      timestamp: '2026-07-02T10:00:00+08:00',
      data: {
        accepted: ['600519.SH'],
        rejected: [{ symbol: '000001.SZ', reason: 'not tradable' }],
        active: ['600519.SH'],
      },
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('subscribed accepted=600519.SH active=600519.SH'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('subscribed rejected=000001.SZ:not tradable'),
    );
  });

  it('logs datasource error messages without dropping desired subscriptions', () => {
    const { service } = createService();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).logger = logger;
    service.subscribe('600519.SH');

    handleMessage(service, {
      type: 'error',
      code: 'TDX_PROVIDER_ERROR',
      message: 'provider unavailable',
      retryable: true,
      details: { provider: 'tdx' },
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'TDX datasource error code=TDX_PROVIDER_ERROR message=provider unavailable retryable=true details={"provider":"tdx"}',
      ),
    );
    expect((service as any).subscriptions.has('600519.SH')).toBe(true);
  });

  it('logs canonical data-based datasource errors without dropping desired subscriptions', () => {
    const { service } = createService();
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    (service as any).logger = logger;
    service.subscribe('600519.SH');

    handleMessage(service, {
      type: 'error',
      provider: 'tdx',
      timestamp: '2026-07-02T10:00:00+08:00',
      data: {
        code: 'TDX_PROVIDER_ERROR',
        message: 'provider unavailable',
        retryable: true,
        details: { provider: 'tdx' },
      },
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'TDX datasource error code=TDX_PROVIDER_ERROR message=provider unavailable retryable=true details={"provider":"tdx"}',
      ),
    );
    expect((service as any).subscriptions.has('600519.SH')).toBe(true);
  });

  it('uses injected WebSocket constructor constants for connection status', async () => {
    const { service } = createService(
      new FakeAggregator(),
      NonStandardReadyStateWebSocket as any,
    );

    expect(service.getConnectionStatus()).toBe('disconnected');

    await service.onModuleInit();
    expect(service.getConnectionStatus()).toBe('connecting');

    await flushSocketOpen();
    expect(service.getConnectionStatus()).toBe('connected');

    await service.onModuleDestroy();
  });

  it('does not create a second socket while the current socket is still connecting', async () => {
    const { service } = createService(
      new FakeAggregator(),
      NonStandardReadyStateWebSocket as any,
    );

    await service.onModuleInit();
    await service.onModuleInit();

    expect(NonStandardReadyStateWebSocket.instances).toHaveLength(1);

    await service.onModuleDestroy();
  });

  it('does not create a second socket while the current socket is already open', async () => {
    const { service } = createService(
      new FakeAggregator(),
      NonStandardReadyStateWebSocket as any,
    );

    await service.onModuleInit();
    await flushSocketOpen();
    await service.onModuleInit();

    expect(NonStandardReadyStateWebSocket.instances).toHaveLength(1);

    await service.onModuleDestroy();
  });

  it('emits normalized bar callbacks without snapshot aggregation', () => {
    const { service, aggregator } = createService();
    const callback = jest.fn();
    service.onBar(callback);

    handleMessage(service, {
      type: 'bar',
      provider: 'tdx',
      data: {
        symbol: '600519.SH',
        period: '1m',
        barTime: '2026-06-26T09:31:00+08:00',
        open: 10.1,
        high: 10.3,
        low: 10.0,
        close: 10.2,
        volume: 1200,
        amount: 12345.6,
        forwardFactor: 0.711862,
        volInStock: 182942480,
      },
    });

    expect(callback).toHaveBeenCalledWith({
      symbol: '600519.SH',
      period: Period.ONE_MIN,
      timestamp: new Date('2026-06-26T09:31:00+08:00'),
      open: 10.1,
      high: 10.3,
      low: 10.0,
      close: 10.2,
      volume: 1200,
      amount: 12345.6,
      extensions: {
        forwardFactor: 0.711862,
        volInStock: 182942480,
      },
    });
    expect(aggregator.process).not.toHaveBeenCalled();
  });

  it.each([
    ['1m', Period.ONE_MIN],
    ['1min', Period.ONE_MIN],
    ['5m', Period.FIVE_MIN],
    ['15m', Period.FIFTEEN_MIN],
    ['30m', Period.THIRTY_MIN],
    ['60m', Period.SIXTY_MIN],
    ['1d', Period.DAY],
    ['day', Period.DAY],
    ['1w', Period.WEEK],
    ['week', Period.WEEK],
    ['1M', Period.MONTH],
    ['month', Period.MONTH],
  ])('maps normalized bar period %s to Period enum', (input, expected) => {
    const { service } = createService();
    const callback = jest.fn();
    service.onBar(callback);

    handleMessage(service, {
      type: 'bar',
      data: {
        symbol: '600519.SH',
        period: input,
        timestamp: '2026-06-26T09:31:00+08:00',
        open: 10.1,
        high: 10.3,
        low: 10.0,
        close: 10.2,
        volume: 1200,
        amount: 12345.6,
      },
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ period: expected }),
    );
  });

  it('keeps quote snapshots flowing through KCandleAggregator with raw provider fields', () => {
    const { service, aggregator } = createService();
    const snapshotCallback = jest.fn();
    service.onSnapshot(snapshotCallback);

    handleMessage(service, {
      type: 'quote',
      data: {
        stock_code: '600519.SH',
        snapshot: {
          Now: 10.2,
          Open: 10.1,
          Max: 10.3,
          Min: 10.0,
          LastClose: 9.9,
          Volume: 1200,
          Amount: 12345.6,
          NowVol: '1449',
          Buyp: ['10.19', '10.18'],
          Buyv: ['10', '20'],
          Sellp: ['10.2', '10.21'],
          Sellv: ['30', '40'],
          Average: '10.15',
          Zangsu: '-0.25',
          AsOf: '2026-06-30T10:16:23+08:00',
        },
      },
    });

    expect(aggregator.process).toHaveBeenCalledWith(
      Period.ONE_MIN,
      expect.objectContaining({
        code: '600519',
        formatCode: '600519.SH',
        now: 10.2,
        high: 10.3,
        low: 10.0,
        timestamp: new Date('2026-06-30T10:16:23+08:00'),
        raw: expect.objectContaining({
          NowVol: '1449',
          Buyp: ['10.19', '10.18'],
          Sellp: ['10.2', '10.21'],
        }),
      }),
    );
    const snapshot = aggregator.process.mock.calls[0][1];
    expect(snapshot).not.toHaveProperty('stockCode');
    expect(snapshotCallback).toHaveBeenCalledWith(snapshot);
  });

  it('emits completed candles with canonical code for downstream persistence', () => {
    const { service, aggregator } = createService();
    const callback = jest.fn();
    service.onCandleComplete(callback);

    aggregator.emitCandle({
      code: '600519',
      period: Period.ONE_MIN,
      timestamp: new Date('2026-06-26T09:31:00+08:00'),
      open: 10.1,
      high: 10.3,
      low: 10.0,
      close: 10.2,
      volume: 1200,
      amount: 12345.6,
    });

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        close: 10.2,
        timestamp: new Date('2026-06-26T09:31:00+08:00'),
      }),
      '600519',
      Period.ONE_MIN,
    );
    expect(callback.mock.calls[0][0]).not.toHaveProperty('raw');
  });

  it('logs rejected legacy candle callbacks without unhandled rejections', async () => {
    const { service, aggregator } = createService();
    const logger = { error: jest.fn() };
    (service as any).logger = logger;
    service.onCandleComplete(jest.fn().mockRejectedValue(new Error('boom')));

    aggregator.emitCandle({
      code: '600519',
      period: Period.ONE_MIN,
      timestamp: new Date('2026-06-26T09:31:00+08:00'),
      open: 10.1,
      high: 10.3,
      low: 10.0,
      close: 10.2,
      volume: 1200,
      amount: 12345.6,
    });
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Candle callback error: Error: boom'),
    );
  });
});
