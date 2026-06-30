import { Logger } from '@nestjs/common';
import { DataSource, Period, Security } from '@app/shared-data';
import { WebSocketCollectionStrategy } from './websocket-collection.strategy';
import { TdxRealtimeBar } from '../../sources/tdx/tdx-websocket.service';

type BarCallback = (bar: TdxRealtimeBar) => void | Promise<void>;
type CandleCallback = (
  candle: any,
  security: Security,
  period: Period,
) => void | Promise<void>;

describe('WebSocketCollectionStrategy TDX normalized bars', () => {
  const createSecurity = (code = '600519') =>
    ({ id: 1, code, sourceConfigs: [] }) as unknown as Security;

  const createBar = (
    symbol: string,
    period: Period = Period.ONE_MIN,
  ): TdxRealtimeBar => ({
    symbol,
    period,
    timestamp: new Date('2026-06-26T09:31:00+08:00'),
    open: 10.1,
    high: 10.3,
    low: 10.0,
    close: 10.2,
    volume: 1200,
    amount: 12345.6,
  });

  const createHarness = (security: Security | null = createSecurity()) => {
    let barCallback: BarCallback | undefined;
    let candleCallback: CandleCallback | undefined;
    const collectorService = {
      findSecurityByCode: jest.fn().mockResolvedValue(security),
      saveRawKData: jest.fn().mockResolvedValue(undefined),
    };
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;
    const tdxWsService = {
      onBar: jest.fn((callback: BarCallback) => {
        barCallback = callback;
      }),
      onCandleComplete: jest.fn((callback: CandleCallback) => {
        candleCallback = callback;
      }),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getConnectionStatus: jest.fn().mockReturnValue('connected'),
    };

    const strategy = new WebSocketCollectionStrategy(
      DataSource.TDX,
      collectorService as any,
      {} as any,
      logger,
      tdxWsService as any,
    );

    return {
      strategy,
      collectorService,
      logger,
      tdxWsService,
      emitBar: async (bar: TdxRealtimeBar) => {
        if (!barCallback) {
          throw new Error('bar callback was not registered');
        }
        await barCallback(bar);
      },
      emitCandle: async (
        candle: any,
        securityForCandle: Security,
        period: Period,
      ) => {
        if (!candleCallback) {
          throw new Error('candle callback was not registered');
        }
        await candleCallback(candle, securityForCandle, period);
      },
    };
  };

  it('resolves real security before saving normalized bar events', async () => {
    const security = createSecurity('600519');
    const { collectorService, emitBar } = createHarness(security);

    await emitBar(createBar('600519.SH'));

    expect(collectorService.findSecurityByCode).toHaveBeenCalledWith('600519');
    expect(collectorService.saveRawKData).toHaveBeenCalledWith(
      security,
      [expect.objectContaining({ close: 10.2, period: Period.ONE_MIN })],
      DataSource.TDX,
      Period.ONE_MIN,
    );
  });

  it('preserves structured TDX extension fields from normalized bar events', async () => {
    const security = createSecurity('600519');
    const { collectorService, emitBar } = createHarness(security);

    await emitBar({
      ...createBar('600519.SH'),
      extensions: {
        forwardFactor: 0.711862,
        volInStock: 182942480,
      },
    });

    expect(collectorService.saveRawKData).toHaveBeenCalledWith(
      security,
      [
        expect.objectContaining({
          extensions: {
            forwardFactor: 0.711862,
            volInStock: 182942480,
          },
        }),
      ],
      DataSource.TDX,
      Period.ONE_MIN,
    );
  });

  it.each([
    ['600519.SH', '600519'],
    ['000001.SZ', '000001'],
    ['SH600519', '600519'],
    ['SZ000001', '000001'],
    ['300750', '300750'],
  ])(
    'converts normalized symbol %s to security code %s',
    async (symbol, code) => {
      const { collectorService, emitBar } = createHarness(createSecurity(code));

      await emitBar(createBar(symbol));

      expect(collectorService.findSecurityByCode).toHaveBeenCalledWith(code);
    },
  );

  it('logs and skips normalized bars when the security is missing', async () => {
    const { collectorService, logger, emitBar } = createHarness(null);

    await emitBar(createBar('600519.SH'));

    expect(collectorService.saveRawKData).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipping TDX bar for 600519.SH: security 600519 not found',
    );
  });

  it('keeps legacy completed candle persistence compatible', async () => {
    const security = createSecurity('600519');
    const { collectorService, emitCandle } = createHarness(security);
    const candle = {
      timestamp: new Date('2026-06-26T09:31:00+08:00'),
      open: 10.1,
      high: 10.3,
      low: 10.0,
      close: 10.2,
      volume: 1200,
      amount: 12345.6,
    };

    await emitCandle(candle, security, Period.FIVE_MIN);

    expect(collectorService.saveRawKData).toHaveBeenCalledWith(
      security,
      [expect.objectContaining({ close: 10.2, period: Period.FIVE_MIN })],
      DataSource.TDX,
      Period.FIVE_MIN,
    );
  });

  it('keeps collectForSecurity subscribe and stop unsubscribe behavior', async () => {
    const { strategy, tdxWsService } = createHarness(createSecurity());
    const security = {
      ...createSecurity('600519'),
      sourceConfigs: [
        {
          source: DataSource.TDX,
          enabled: true,
          formatCode: '600519.SH',
        },
      ],
    } as Security;

    await expect(
      strategy.collectForSecurity(security, Period.ONE_MIN),
    ).resolves.toBe(1);
    await strategy.stop();

    expect(tdxWsService.subscribe).toHaveBeenCalledWith('600519.SH');
    expect(tdxWsService.unsubscribe).toHaveBeenCalledWith('600519.SH');
  });

  it('can unsubscribe one test streaming security without stopping the strategy', async () => {
    const { strategy, tdxWsService } = createHarness(createSecurity());
    const security = {
      ...createSecurity('600519'),
      sourceConfigs: [
        {
          source: DataSource.TDX,
          enabled: true,
          formatCode: '600519.SH',
        },
      ],
    } as Security;

    await expect(strategy.unsubscribeForSecurity(security)).resolves.toBe(1);

    expect(tdxWsService.unsubscribe).toHaveBeenCalledWith('600519.SH');
  });
});
