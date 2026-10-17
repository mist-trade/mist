import { TRADING_RULES } from '@app/constants';

/**
 * 策略模块（libs/strategy）核心领域常量定义
 */

export const DECISION_ACTIONS = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
  NEUTRAL: 'NEUTRAL',
  TERMINAL: 'TERMINAL',
} as const);

export const SIGNAL_KINDS = Object.freeze({
  ENTRY: 'entry',
  EXIT: 'exit',
} as const);

export const CANDIDATE_BSP_TYPES = Object.freeze({
  FIRST_BUY: 'first_buy',
  FIRST_SELL: 'first_sell',
  SECOND_BUY: 'second_buy',
  SECOND_SELL: 'second_sell',
  THIRD_BUY: 'third_buy',
  THIRD_SELL: 'third_sell',
} as const);

export const CHAN_BSP_UNITS = Object.freeze({
  BI: 'bi',
  DUAN: 'duan',
} as const);

export const CHAN_BSP_DIRECTIONS = Object.freeze({
  BUY: 'buy',
  SELL: 'sell',
} as const);

export const DEFAULT_REQUIRED_BARS_DUAN = 200;
export const DEFAULT_REQUIRED_BARS_BI = 50;

export const BSP_CONFIDENCE = Object.freeze({
  FIRST: 0.92,
  THIRD: 0.9,
  SECOND: 0.86,
  DEFAULT: 0.8,
} as const);

export const DEFAULT_TECHNICAL_FACTOR_CONFIDENCE = 0.75;

export const ORDER_SIDES = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
} as const);

export const ORDER_TYPES = Object.freeze({
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
} as const);

export const ORDER_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  FILLED: 'FILLED',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  CANCELLED: 'CANCELLED',
} as const);

export const ORDER_REJECT_REASONS = Object.freeze({
  BUY_REJECTED_LIMIT_UP: 'BUY_REJECTED_LIMIT_UP',
  SELL_BLOCKED_LIMIT_DOWN: 'SELL_BLOCKED_LIMIT_DOWN',
  INSUFFICIENT_CASH: 'INSUFFICIENT_CASH',
  INSUFFICIENT_SHARES: 'INSUFFICIENT_SHARES',
  T1_LOCKED_SHARES: 'T1_LOCKED_SHARES',
  INVALID_LOT_SIZE: 'INVALID_LOT_SIZE',
  CAUSALITY_VIOLATION: 'CAUSALITY_VIOLATION',
} as const);

export const DEFAULT_BROKER_INITIAL_CASH = 1_000_000;

export const EXECUTION_RULES = Object.freeze({
  DEFAULT_COMMISSION_RATE: 0.00025,
  MIN_COMMISSION: 5,
  TRANSFER_FEE_RATE: TRADING_RULES.TRANSFER_FEE_RATE,
  STAMP_DUTY_RATE: TRADING_RULES.STAMP_DUTY_RATE,
  DEFAULT_SLIPPAGE_RATIO: 0.001,
} as const);

export const POSITION_STATUSES = Object.freeze({
  EMPTY: 'EMPTY',
  HOLDING: 'HOLDING',
  CLOSED: 'CLOSED',
} as const);

export const EXIT_ACTIONS = Object.freeze({
  HOLD: 'HOLD',
  EXIT: 'EXIT',
} as const);

export const POSITION_DECIMAL_PLACES = Object.freeze({
  RATIO_SCALE: 10000,
  DATE_STRING_LENGTH: 10,
} as const);

export const POSITION_EXIT_REASONS = Object.freeze({
  SIGNAL_EXIT: 'SIGNAL_EXIT',
} as const);
