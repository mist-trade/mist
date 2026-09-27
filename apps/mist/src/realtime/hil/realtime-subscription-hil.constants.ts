/**
 * Realtime Subscription HIL (Hardware-in-the-Loop) 测试与验证套件常量
 */

export const HIL_TIMEOUTS = Object.freeze({
  DEFAULT_SNAPSHOT_TIMEOUT_MS: 30_000,
  DEFAULT_READY_TIMEOUT_MS: 30_000,
  DEFAULT_QMT_CALLBACK_OBSERVATION_MS: 10_000,
  DEFAULT_TDX_VERIFY_CYCLES: 3,
} as const);

export const HIL_RESULTS = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const);

export const HIL_REASONS = Object.freeze({
  NONE: 'none',
} as const);
