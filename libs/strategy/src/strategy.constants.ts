/**
 * 策略模块（libs/strategy）核心领域常量定义
 */

export const DECISION_ACTIONS = Object.freeze({
  BUY: 'BUY',
  SELL: 'SELL',
  NEUTRAL: 'NEUTRAL',
  TERMINAL: 'TERMINAL',
} as const);

export type DecisionActionType =
  (typeof DECISION_ACTIONS)[keyof typeof DECISION_ACTIONS];

export const STRATEGY_KINDS = Object.freeze({
  DECISION_FLOW: 'decision_flow',
  CHAN_BSP: 'chan_bsp',
} as const);

export type StrategyKindType =
  (typeof STRATEGY_KINDS)[keyof typeof STRATEGY_KINDS];

export const STRATEGY_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  STOPPED: 'stopped',
} as const);

export const SIGNAL_KINDS = Object.freeze({
  ENTRY: 'entry',
  EXIT: 'exit',
} as const);

export const MACRO_TREND_DIRECTIONS = Object.freeze({
  UP: 'UP',
  DOWN: 'DOWN',
  RANGE: 'RANGE',
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

export const HIGHER_PERIOD_RATIOS = Object.freeze({
  DEFAULT: 4,
  ONE_MIN: 5,
  FIVE_MIN: 6,
  FIFTEEN_MIN: 4,
  THIRTY_MIN: 4,
  SIXTY_MIN: 4,
  DAILY: 5,
} as const);

export const MACD_MIN_CALCULATION_BARS = 34;
export const DEFAULT_REQUIRED_BARS_DUAN = 200;
export const DEFAULT_REQUIRED_BARS_BI = 50;

export const BSP_CONFIDENCE = Object.freeze({
  FIRST: 0.92,
  THIRD: 0.9,
  SECOND: 0.86,
  DEFAULT: 0.8,
} as const);

export const DEFAULT_TECHNICAL_FACTOR_CONFIDENCE = 0.75;

export const STRATEGY_DEFAULT_PERIODS = Object.freeze([1, 5, 15, 30, 60, 1440]);
export const DEFAULT_PREWARM_BARS = 200;
export const DEFAULT_SIMULATION_SPEED = 1;
