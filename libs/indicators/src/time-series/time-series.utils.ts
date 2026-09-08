import { IndicatorInputError } from '../errors';

/**
 * Validates that a window parameter is a strictly positive integer.
 */
export function assertValidWindow(window: number, functionName: string): void {
  if (!Number.isInteger(window) || window <= 0) {
    throw new IndicatorInputError(
      `${functionName} requires window to be a strictly positive integer, received: ${window}`,
    );
  }
}

/**
 * Validates that a period/lag parameter is a strictly positive integer.
 */
export function assertValidPeriod(period: number, functionName: string): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw new IndicatorInputError(
      `${functionName} requires period to be a strictly positive integer, received: ${period}`,
    );
  }
}

/**
 * Validates that dual series inputs have identical lengths.
 */
export function assertMatchingLengths(
  lenA: number,
  lenB: number,
  functionName: string,
): void {
  if (lenA !== lenB) {
    throw new IndicatorInputError(
      `${functionName} requires dual series inputs to have identical lengths, received: ${lenA} and ${lenB}`,
    );
  }
}
