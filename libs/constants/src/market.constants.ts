/**
 * 全局通用市场与行情常量定义
 */

export const MARKET_SOURCES = Object.freeze({
  TDX: 'tdx',
  QMT: 'qmt',
  EASTMONEY: 'eastmoney',
} as const);

export const PERIOD_MINUTES = Object.freeze({
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '60m': 60,
  '1d': 1440,
} as const);

export const CANDLE_SESSIONS = Object.freeze({
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
} as const);

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

export const TRADING_RULES = Object.freeze({
  DEFAULT_COMMISSION_RATE: 0.00025,
  MIN_COMMISSION: 5,
  TRANSFER_FEE_RATE: 0.00001,
  STAMP_DUTY_RATE: 0.0005,
  DEFAULT_SLIPPAGE_RATIO: 0.001,
  CHINEXT_STAR_LIMIT_RATIO: 0.2,
  MAIN_BOARD_LIMIT_RATIO: 0.1,
} as const);
