import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { KCandleAggregator, CompletedCandle } from './kcandle-aggregator';
import { Period, Security } from '@app/shared-data';
import { TdxExtension, TdxResponse, TdxSnapshot } from './types';
import { TimezoneService } from '@app/timezone';

type SnapshotCallback = (snapshot: TdxSnapshot) => void | Promise<void>;
export interface TdxRealtimeBar {
  symbol: string;
  period: Period;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  extensions?: TdxExtension;
}

type BarCallback = (bar: TdxRealtimeBar) => void | Promise<void>;
type CandleCompleteCallback = (
  candle: TdxResponse,
  security: Security,
  period: Period,
) => void | Promise<void>;

export const TDX_WEBSOCKET_CTOR = 'TDX_WEBSOCKET_CTOR';

@Injectable()
export class TdxWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TdxWebSocketService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private readonly subscriptions = new Set<string>();
  private snapshotCallbacks: SnapshotCallback[] = [];
  private barCallbacks: BarCallback[] = [];
  private candleCallbacks: CandleCompleteCallback[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly reconnectDelay = 5000;
  private readonly heartbeatIntervalMs = 30000;
  private isShuttingDown = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly aggregator: KCandleAggregator,
    private readonly timezoneService: TimezoneService,
    @Optional()
    @Inject(TDX_WEBSOCKET_CTOR)
    private readonly webSocketCtor: typeof WebSocket = WebSocket,
  ) {
    this.baseUrl =
      this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    this.clientId =
      this.configService.get<string>('TDX_WS_CLIENT_ID') || 'mist-backend-tdx';

    // Convert HTTP URL to WS URL and build WebSocket path
    const wsBaseUrl = this.baseUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
    this.wsUrl = `${wsBaseUrl}/ws/quote/${this.clientId}`;

    // Initialize aggregator callback to bridge candles to candleCallbacks
    this.aggregator.on('candle', (candle: CompletedCandle) => {
      this.handleCompletedCandle(candle);
    });
  }

  async onModuleInit(): Promise<void> {
    this.isShuttingDown = false;
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }

  onSnapshot(callback: SnapshotCallback): void {
    this.snapshotCallbacks.push(callback);
  }

  onBar(callback: BarCallback): void {
    this.barCallbacks.push(callback);
  }

  onCandleComplete(callback: CandleCompleteCallback): void {
    this.candleCallbacks.push(callback);
  }

  subscribe(stockCode: string): void {
    this.subscriptions.add(stockCode);
    this.sendSubscription();
  }

  unsubscribe(stockCode: string): void {
    this.subscriptions.delete(stockCode);
    this.sendSubscription();
  }

  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (!this.ws) return 'disconnected';
    if (this.ws.readyState === this.webSocketCtor.OPEN) return 'connected';
    if (this.ws.readyState === this.webSocketCtor.CONNECTING)
      return 'connecting';
    return 'disconnected';
  }

  /**
   * Get WebSocket connection info for debugging
   */
  getConnectionInfo(): { url: string; clientId: string; status: string } {
    return {
      url: this.wsUrl,
      clientId: this.clientId,
      status: this.getConnectionStatus(),
    };
  }

  private connect(): void {
    if (
      this.ws?.readyState === this.webSocketCtor.OPEN ||
      this.ws?.readyState === this.webSocketCtor.CONNECTING
    ) {
      return;
    }

    this.logger.log(`Connecting to TDX WebSocket: ${this.wsUrl}`);

    try {
      this.ws = new this.webSocketCtor(this.wsUrl);

      this.ws.on('open', () => {
        this.logger.log('TDX WebSocket connected');
        this.clearReconnectTimeout();
        this.sendSubscription();
        this.startHeartbeat();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error(`TDX WebSocket error: ${error.message}`);
      });

      this.ws.on('close', () => {
        if (this.isShuttingDown) {
          return;
        }
        this.logger.warn('TDX WebSocket disconnected, reconnecting...');
        this.clearHeartbeat();
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error(`Failed to connect to TDX WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private disconnect(): void {
    this.isShuttingDown = true;
    this.clearReconnectTimeout();
    this.clearHeartbeat();
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.close();
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'pong') {
        // Heartbeat response
        return;
      }

      if (message.type === 'ready') {
        this.logger.log('TDX datasource ready, resyncing subscriptions');
        this.sendSubscription();
        return;
      }

      if (message.type === 'subscribed' || message.type === 'unsubscribed') {
        this.logSubscriptionAck(message.type, message);
        return;
      }

      if (message.type === 'error') {
        this.logDatasourceError(message);
        return;
      }

      if (message.type === 'quote') {
        const snapshot = this.parseSnapshot(message.data);
        this.processSnapshot(snapshot);
        return;
      }

      if (message.type === 'bar') {
        const bar = this.parseBar(message.data);
        this.processBar(bar);
      }
    } catch (error) {
      this.logger.error(`Failed to handle WebSocket message: ${error}`);
    }
  }

  private parseSnapshot(data: {
    stock_code: string;
    snapshot: any;
  }): TdxSnapshot {
    const s = data.snapshot;
    return {
      stockCode: data.stock_code,
      now: this.readNumber(s, ['Now', 'now', 'Last', 'last', 'Close', 'close']),
      open: this.readNumber(s, ['Open', 'open']),
      high: this.readNumber(s, ['Max', 'max', 'High', 'high']),
      low: this.readNumber(s, ['Min', 'min', 'Low', 'low']),
      lastClose: this.readNumber(s, ['LastClose', 'lastClose']),
      volume: this.readNumber(s, ['Volume', 'volume']),
      amount: this.readNumber(s, ['Amount', 'amount']),
      timestamp: this.timezoneService.getCurrentBeijingTime(),
    };
  }

  private parseBar(data: Record<string, unknown>): TdxRealtimeBar {
    const symbol = String(data.symbol || '').trim();
    const timestampValue = data.timestamp || data.barTime;
    const timestamp = new Date(String(timestampValue));

    if (!symbol) {
      throw new Error('TDX bar symbol is required');
    }
    if (Number.isNaN(timestamp.getTime())) {
      throw new Error(`Invalid TDX bar timestamp: ${timestampValue}`);
    }

    const extensions = this.extractBarExtensions(data);

    return {
      symbol,
      period: this.parsePeriod(data.period),
      timestamp,
      open: Number(data.open),
      high: Number(data.high),
      low: Number(data.low),
      close: Number(data.close),
      volume: Number(data.volume),
      amount: Number(data.amount || 0),
      ...(extensions ? { extensions } : {}),
    };
  }

  private parsePeriod(value: unknown): Period {
    const period = String(value || '').trim();
    if (period === '1M') {
      return Period.MONTH;
    }

    const aliases: Record<string, Period> = {
      '1': Period.ONE_MIN,
      '1m': Period.ONE_MIN,
      '1min': Period.ONE_MIN,
      '5': Period.FIVE_MIN,
      '5m': Period.FIVE_MIN,
      '5min': Period.FIVE_MIN,
      '15': Period.FIFTEEN_MIN,
      '15m': Period.FIFTEEN_MIN,
      '15min': Period.FIFTEEN_MIN,
      '30': Period.THIRTY_MIN,
      '30m': Period.THIRTY_MIN,
      '30min': Period.THIRTY_MIN,
      '60': Period.SIXTY_MIN,
      '60m': Period.SIXTY_MIN,
      '60min': Period.SIXTY_MIN,
      '1d': Period.DAY,
      day: Period.DAY,
      '1w': Period.WEEK,
      week: Period.WEEK,
      month: Period.MONTH,
    };

    const mapped = aliases[period.toLowerCase()];
    if (!mapped) {
      throw new Error(`Unsupported TDX bar period: ${period}`);
    }
    return mapped;
  }

  private readNumber(source: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null) {
        return Number(value);
      }
    }
    return 0;
  }

  private readOptionalNumber(
    source: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
      }
    }
    return undefined;
  }

  private extractBarExtensions(
    data: Record<string, unknown>,
  ): TdxExtension | undefined {
    const extension: TdxExtension = {};
    const forwardFactor = this.readOptionalNumber(data, ['forwardFactor']);
    const volInStock = this.readOptionalNumber(data, ['volInStock']);

    if (forwardFactor !== undefined) {
      extension.forwardFactor = forwardFactor;
    }
    if (volInStock !== undefined) {
      extension.volInStock = volInStock;
    }

    return Object.keys(extension).length > 0 ? extension : undefined;
  }

  private logSubscriptionAck(
    type: string,
    message: Record<string, unknown>,
  ): void {
    const accepted = this.formatSymbolList(message.accepted);
    const active = this.formatSymbolList(message.active);
    const rejected = this.formatRejectedSymbols(message.rejected);

    this.logger.log(
      `TDX datasource ${type} accepted=${accepted} active=${active}`,
    );
    if (rejected) {
      this.logger.warn(`TDX datasource ${type} rejected=${rejected}`);
    }
  }

  private formatSymbolList(value: unknown): string {
    if (!Array.isArray(value)) {
      return '';
    }
    return value.map((item) => String(item)).join(',');
  }

  private formatRejectedSymbols(value: unknown): string {
    if (!Array.isArray(value)) {
      return '';
    }
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const symbol = String(record.symbol ?? record.code ?? '');
          const reason = record.reason ? `:${String(record.reason)}` : '';
          return `${symbol}${reason}`;
        }
        return String(item);
      })
      .filter(Boolean)
      .join(',');
  }

  private logDatasourceError(message: Record<string, unknown>): void {
    const nested =
      message.error && typeof message.error === 'object'
        ? (message.error as Record<string, unknown>)
        : message;
    const code = String(nested.code ?? 'TDX_DATASOURCE_ERROR');
    const errorMessage = String(nested.message ?? 'unknown datasource error');
    const retryable = Boolean(nested.retryable);
    const details =
      nested.details && typeof nested.details === 'object'
        ? nested.details
        : {};

    this.logger.error(
      `TDX datasource error code=${code} message=${errorMessage} retryable=${retryable} details=${JSON.stringify(details)}`,
    );
  }

  private processSnapshot(snapshot: TdxSnapshot): void {
    // Notify snapshot callbacks
    for (const callback of this.snapshotCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        this.logger.error(`Snapshot callback error: ${error}`);
      }
    }

    // Aggregate into K-lines for subscribed periods
    const periods = [
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
    ];

    for (const period of periods) {
      try {
        this.aggregator.process(snapshot.stockCode, period, snapshot);
      } catch (error) {
        this.logger.error(`Aggregator error for ${period}: ${error}`);
      }
    }
  }

  private processBar(bar: TdxRealtimeBar): void {
    for (const callback of this.barCallbacks) {
      try {
        const result = callback(bar);
        void Promise.resolve(result).catch((error) => {
          this.logger.error(`Bar callback error: ${error}`);
        });
      } catch (error) {
        this.logger.error(`Bar callback error: ${error}`);
      }
    }
  }

  private sendSubscription(): void {
    if (this.ws?.readyState !== this.webSocketCtor.OPEN) {
      return;
    }

    const message = JSON.stringify({
      type: 'sync_subscriptions',
      stocks: Array.from(this.subscriptions),
    });

    this.ws.send(message);
  }

  private startHeartbeat(): void {
    // Clear existing interval if any
    this.clearHeartbeat();

    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === this.webSocketCtor.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        this.clearHeartbeat();
      }
    }, this.heartbeatIntervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.logger.log('Reconnecting to TDX WebSocket...');
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectDelay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private handleCompletedCandle(candle: CompletedCandle): void {
    // Convert to TdxResponse format
    const tdxResponse: TdxResponse = {
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      amount: candle.amount,
    };

    // Find security for this stock code (simplified - in production, cache this)
    const security: Partial<Security> = {
      code: candle.stockCode.replace(/^SH|SZ/, ''),
    };

    for (const callback of this.candleCallbacks) {
      try {
        const result = callback(
          tdxResponse,
          security as Security,
          candle.period,
        );
        void Promise.resolve(result).catch((error) => {
          this.logger.error(`Candle callback error: ${error}`);
        });
      } catch (error) {
        this.logger.error(`Candle callback error: ${error}`);
      }
    }
  }
}
