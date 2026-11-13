/**
 * 盘前主动巡检相关常量与默认配置
 */

export const PRE_MARKET_INSPECTION_CONFIG = Object.freeze({
  DEFAULT_PROBE_TIMEOUT_MS: 5_000,
  DEFAULT_TDX_BASE_URL: 'http://tdx-datasource:9001',
  DEFAULT_QMT_BASE_URL: 'http://qmt-datasource:9002',
  DEFAULT_SIGNAL_HEALTH_URL: 'http://signal:8010/health',
  DEFAULT_BACKEND_HEALTH_URL: 'http://mist-backend:8001/health',
} as const);

export const INSPECTION_STATUS = Object.freeze({
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  OK: 'ok',
  UNKNOWN: 'unknown',
} as const);

export const BEIJING_DATE_SUFFIX = Object.freeze({
  START_OF_DAY: 'T00:00:00+08:00',
  END_OF_DAY: 'T23:59:59+08:00',
} as const);
