/**
 * Centralized error messages for the Mist application
 * All error messages should be defined here to ensure consistency
 * and make localization easier in the future.
 *
 * All messages are in English for consistency across the codebase.
 */

export const ERROR_MESSAGES = {
  // === 400 Bad Request ===
  BI_ARRAY_EMPTY: 'Invalid input: bi array cannot be empty',

  // === 404 Not Found ===
  INDEX_NOT_FOUND: 'Index information not found',

  // === 500 Internal Server Error - External Service Failures ===
  TRADING_DAY_CHECK_FAILED: 'Failed to check if date is a trading day',
} as const;

export type ErrorMessage = keyof typeof ERROR_MESSAGES;
