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
