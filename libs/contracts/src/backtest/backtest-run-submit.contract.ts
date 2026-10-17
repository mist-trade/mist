import { isRecord } from '@app/utils';

export const BACKTEST_RUN_SUBMIT_PATTERN = 'backtest.run.submit.v1' as const;

export interface SubmitBacktestRunCommandV1 {
  readonly runId: number;
}

export type SubmitBacktestRunErrorCode =
  | 'queue_full'
  | 'not_ready'
  | 'run_failed';

export function decodeSubmitBacktestRunCommandV1(
  value: unknown,
): SubmitBacktestRunCommandV1 {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.runId) ||
    (value.runId as number) <= 0
  ) {
    throw new TypeError('runId must be a positive safe integer');
  }
  return { runId: value.runId as number };
}

export function decodeSubmitBacktestRunSuccessV1(value: unknown): null {
  if (value !== null) {
    throw new TypeError('backtest RPC success data must be null');
  }
  return null;
}

export function decodeSubmitBacktestRunErrorCodeV1(
  value: unknown,
): SubmitBacktestRunErrorCode {
  if (
    value !== 'queue_full' &&
    value !== 'not_ready' &&
    value !== 'run_failed'
  ) {
    throw new TypeError('unsupported backtest RPC rejection code');
  }
  return value;
}

export const BACKTEST_SAFE_FAILURE_CODES = [
  'BACKTEST_QUEUE_FULL',
  'BACKTEST_NOT_READY',
  'BACKTEST_UNAVAILABLE',
  'BACKTEST_COMMAND_TIMEOUT',
  'BACKTEST_RPC_INTERNAL_ERROR',
  'BACKTEST_SOURCE_UNSUPPORTED',
  'BACKTEST_TARGET_UNIVERSE_EMPTY',
  'BACKTEST_NO_EXECUTABLE_TARGETS',
  'BACKTEST_DATABASE_ERROR',
  'BACKTEST_EXECUTION_TIMEOUT',
  'BACKTEST_BAR_LIMIT_EXCEEDED',
  'BACKTEST_QUANTITY_PROFILE_UNAVAILABLE',
  'BACKTEST_EXECUTION_FAILED',
  'BACKTEST_INTERRUPTED',
  'BACKTEST_STARTUP_QUEUE_FULL',
  'BACKTEST_STARTUP_UNAVAILABLE',
] as const;

export type BacktestSafeFailureCode =
  (typeof BACKTEST_SAFE_FAILURE_CODES)[number];

export const SAFE_FAILURE_CODES_SET = new Set<string>(
  BACKTEST_SAFE_FAILURE_CODES,
);
