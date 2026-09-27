/**
 * 本地策略开发网关（tools/strategy-dev/server.ts）常量配置
 */

export const DEFAULT_DEV_PORT = 8001;
export const DEFAULT_DEV_SECURITY_CODE = '000001';
export const DEFAULT_DEV_PERIOD = 30;
export const DEFAULT_DEV_KLINE_LIMIT = 2000;
export const DEFAULT_DEV_SECURITY_ID = 1;
export const DEFAULT_DEV_MARKET_SOURCE = 'qmt' as const;
export const DEFAULT_DEV_API_PATH = '/api/v1';

export const LOOPBACK_IPS = Object.freeze([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);
export const LOOPBACK_IPV4_PREFIX = '127.';

export const DEV_HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  SUCCESS_MAX: 300,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
});

export const DEV_CORS_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

export const SSE_HEARTBEAT_INTERVAL_MS = 15000;
export const SESSION_INACTIVE_TTL_MS = 30 * 60 * 1000;
