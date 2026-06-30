import { Injectable, Logger, Inject } from '@nestjs/common';
import { Security, Period, DataSource } from '@app/shared-data';
import { ConfigService } from '@nestjs/config';
import { CollectorService } from '../collector.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';
import { TdxWebSocketService } from '../../sources/tdx/tdx-websocket.service';
import { TdxResponse } from '../../sources/tdx/types';
import { TdxRealtimeBar } from '../../sources/tdx/tdx-websocket.service';
import { normalizeSecurityCode } from '@app/utils';

/**
 * WebSocket data collection strategy
 *
 * - Mode: streaming (real-time push)
 * - For: TDX (delegates to TdxWebSocketService)
 * - For: MINI_QMT (stub, not yet implemented)
 */
@Injectable()
export class WebSocketCollectionStrategy implements IDataCollectionStrategy {
  readonly source: DataSource;
  readonly mode: CollectionMode = 'streaming';

  private subscriptions = new Map<string, string>();
  private tdxWsService: TdxWebSocketService | null = null;

  constructor(
    source: DataSource,
    private readonly collectorService: CollectorService,
    private readonly configService: ConfigService,
    private readonly logger: Logger,
    @Inject(TdxWebSocketService) tdxWsService?: TdxWebSocketService,
  ) {
    if (source !== DataSource.TDX && source !== DataSource.MINI_QMT) {
      throw new Error(
        `WebSocket strategy only supports TDX and MINI_QMT, got ${source}`,
      );
    }
    this.source = source;

    // Inject TdxWebSocketService for TDX source
    if (source === DataSource.TDX && tdxWsService) {
      this.tdxWsService = tdxWsService;
      this.setupTdxCallbacks();
    }
  }

  private setupTdxCallbacks(): void {
    if (!this.tdxWsService) return;

    this.tdxWsService.onBar(async (bar: TdxRealtimeBar) => {
      await this.handleTdxBar(bar);
    });

    // Handle completed candles - save to database
    this.tdxWsService.onCandleComplete(
      async (candle: TdxResponse, symbol: string, period: Period) => {
        await this.handleTdxCandle(candle, symbol, period);
      },
    );
  }

  private async handleTdxCandle(
    candle: TdxResponse,
    symbol: string,
    period: Period,
  ): Promise<void> {
    const code = normalizeSecurityCode(symbol);

    try {
      const security = await this.collectorService.findSecurityByCode(code);
      if (!security) {
        this.logger.warn(
          `Skipping TDX candle for ${symbol}: security ${code} not found`,
        );
        return;
      }

      const kData = {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        amount: candle.amount || 0,
        period,
        ...(candle.extensions ? { extensions: candle.extensions } : {}),
      };

      await this.collectorService.saveRawKData(
        security,
        [kData],
        DataSource.TDX,
        period,
      );

      this.logger.debug(
        `Saved ${period} TDX candle for ${security.code} at ${candle.timestamp}`,
      );
    } catch (error) {
      this.logger.error(`Failed to save TDX candle for ${symbol}: ${error}`);
    }
  }

  private async handleTdxBar(bar: TdxRealtimeBar): Promise<void> {
    const code = normalizeSecurityCode(bar.symbol);

    try {
      const security = await this.collectorService.findSecurityByCode(code);
      if (!security) {
        this.logger.warn(
          `Skipping TDX bar for ${bar.symbol}: security ${code} not found`,
        );
        return;
      }

      const kData = {
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        amount: bar.amount || 0,
        period: bar.period,
        ...(bar.extensions ? { extensions: bar.extensions } : {}),
      };

      await this.collectorService.saveRawKData(
        security,
        [kData],
        DataSource.TDX,
        bar.period,
      );

      this.logger.debug(
        `Saved ${bar.period} TDX bar for ${security.code} at ${bar.timestamp}`,
      );
    } catch (error) {
      this.logger.error(`Failed to save TDX bar for ${bar.symbol}: ${error}`);
    }
  }

  async start(): Promise<void> {
    if (this.source === DataSource.TDX) {
      if (!this.tdxWsService) {
        this.logger.warn('TdxWebSocketService not available');
        return;
      }

      const status = this.tdxWsService.getConnectionStatus();
      if (status === 'connected') {
        this.logger.log('TDX WebSocket already connected');
        return;
      }

      this.logger.log('TDX WebSocket will auto-connect on module init');
      return;
    }

    // MINI_QMT not implemented
    this.logger.warn(
      `WebSocket strategy for ${this.source} is not yet implemented. Streaming mode is disabled.`,
    );
  }

  async stop(): Promise<void> {
    if (this.source === DataSource.TDX && this.tdxWsService) {
      // TdxWebSocketService handles its own lifecycle via OnModuleDestroy
      // Just clear our subscriptions
      for (const formatCode of this.subscriptions.values()) {
        this.tdxWsService.unsubscribe(formatCode);
      }
      this.subscriptions.clear();
    }
  }

  async unsubscribeForSecurity(security: Security): Promise<number> {
    if (this.source === DataSource.TDX && this.tdxWsService) {
      const code = normalizeSecurityCode(security.code);
      const formatCode = this.getFormatCode(security);
      const subscribedFormatCode = this.subscriptions.get(code) || formatCode;
      this.tdxWsService.unsubscribe(subscribedFormatCode);
      this.subscriptions.delete(code);

      this.logger.log(
        `Unsubscribed TDX WebSocket for ${security.code} (${subscribedFormatCode})`,
      );

      return 1;
    }

    this.logger.warn(
      `WebSocket unsubscribe for ${this.source} is not yet implemented. Security ${security.code} may remain subscribed.`,
    );
    return 0;
  }

  async collectForSecurity(
    security: Security,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    period: Period,
  ): Promise<number> {
    if (this.source === DataSource.TDX) {
      if (!this.tdxWsService) {
        this.logger.warn('TdxWebSocketService not available');
        return 0;
      }

      // Subscribe to real-time data for this security
      const code = normalizeSecurityCode(security.code);
      const formatCode = this.getFormatCode(security);
      const previousFormatCode = this.subscriptions.get(code);
      if (previousFormatCode && previousFormatCode !== formatCode) {
        this.tdxWsService.unsubscribe(previousFormatCode);
      }

      this.tdxWsService.subscribe(formatCode);
      this.subscriptions.set(code, formatCode);

      this.logger.log(
        `Subscribed to TDX WebSocket for ${security.code} (${formatCode})`,
      );

      // Return 1 to indicate subscription was set up
      // Actual data will be pushed via callbacks
      return 1;
    }

    // MINI_QMT not implemented
    this.logger.warn(
      `WebSocket subscription for ${this.source} is not yet implemented. Security ${security.code} will not receive streaming data.`,
    );
    return 0;
  }

  private getFormatCode(security: Security): string {
    const config = security.sourceConfigs?.find(
      (c) => c.source === DataSource.TDX && c.enabled,
    );
    return config?.formatCode || security.code;
  }
}
