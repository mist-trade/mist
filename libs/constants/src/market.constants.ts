/**
 * 全局通用市场与行情常量定义
 */

export const MARKET_SOURCES = Object.freeze({
  TDX: 'tdx',
  QMT: 'qmt',
  EASTMONEY: 'eastmoney',
} as const);

export type MarketSourceType =
  (typeof MARKET_SOURCES)[keyof typeof MARKET_SOURCES];

export const PERIOD_NAMES = Object.freeze({
  ONE_MIN: '1m',
  FIVE_MIN: '5m',
  FIFTEEN_MIN: '15m',
  THIRTY_MIN: '30m',
  SIXTY_MIN: '60m',
  ONE_DAY: '1d',
} as const);

export const PERIOD_MINUTES = Object.freeze({
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 1440,
} as const);

export const SECURITY_TYPES = Object.freeze({
  STOCK: 'STOCK',
  INDEX: 'INDEX',
  ETF: 'ETF',
} as const);

export const CANDLE_SESSIONS = Object.freeze({
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
} as const);

export type CandleSessionType =
  (typeof CANDLE_SESSIONS)[keyof typeof CANDLE_SESSIONS];

export const CANDLE_FIELDS = Object.freeze({
  OPEN: 'open',
  HIGH: 'high',
  LOW: 'low',
  CLOSE: 'close',
  VOLUME: 'volume',
  AMOUNT: 'amount',
} as const);

export const CANDLE_VALIDITY = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
} as const);

export const CANDLE_STATUS = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
  OPENED: 'opened',
  UPDATED: 'updated',
  ROLLED_OVER: 'rolled-over',
  SKIPPED: 'skipped',
  INVALIDATED: 'invalidated',
  SEALED: 'sealed',
  DISCARDED: 'discarded',
  COMPLETED: 'completed',
} as const);

export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_KLINE_FETCH_LIMIT = 2000;
