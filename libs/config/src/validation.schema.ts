import * as Joi from 'joi';

/**
 * Common environment variable validation schema
 * Shared across all apps that need database connection
 */
export const commonEnvSchema = Joi.object({
  // MySQL Configuration
  mysql_server_host: Joi.string().hostname().required(),
  mysql_server_port: Joi.number().port().default(3306),
  mysql_server_username: Joi.string().required(),
  mysql_server_password: Joi.string().required(),
  mysql_server_database: Joi.string().required(),

  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  // AKTools
  AKTOOLS_BASE_URL: Joi.string().uri().default('http://localhost:8080'),
});

/**
 * App-specific environment variable validation
 */
export const appEnvSchema = Joi.object({
  // Add app-specific variables (ports, API keys, etc.)
  nest_server_port: Joi.number().port().default(3000),
  redis_server_host: Joi.string().hostname().default('localhost'),
  redis_server_port: Joi.number().port().default(6379),
  redis_server_db: Joi.number().default(0),
}).concat(commonEnvSchema);

/**
 * Mist app-specific environment variable validation
 */
export const mistEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8001),
  redis_server_host: Joi.string().hostname().default('localhost'),
  redis_server_port: Joi.number().port().default(6379),
  redis_server_db: Joi.number().default(0),

  // Data source configuration
  // Accepts enum values ('ef', 'tdx', 'mqmt') or enum keys ('EAST_MONEY', 'TDX', 'MINI_QMT')
  DEFAULT_DATA_SOURCE: Joi.string()
    .valid('ef', 'tdx', 'mqmt', 'EAST_MONEY', 'TDX', 'MINI_QMT')
    .default('ef')
    .description('Default data source for queries (enum value or key)'),

  // TDX data source configuration
  TDX_BASE_URL: Joi.string()
    .uri()
    .optional()
    .description('TDX data source base URL (mist-datasource service)'),

  // WebSocket client identification for multi-connection support
  // Each data source has its own WebSocket endpoint and client ID
  TDX_WS_CLIENT_ID: Joi.string()
    .default('mist-backend-tdx')
    .description('WebSocket client ID for TDX data source connection'),

  TDX_WS_RECONNECT_DELAY_MS: Joi.number()
    .integer()
    .positive()
    .default(5000)
    .description('TDX WebSocket reconnect delay in milliseconds'),

  TDX_WS_HEARTBEAT_INTERVAL_MS: Joi.number()
    .integer()
    .positive()
    .default(30000)
    .description('TDX WebSocket heartbeat interval in milliseconds'),

  QMT_WS_CLIENT_ID: Joi.string()
    .default('mist-backend-qmt')
    .description('WebSocket client ID for miniQMT data source connection'),
});

/**
 * Chan app-specific environment variable validation
 */
export const chanEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8008),

  // TDX data source configuration
  TDX_BASE_URL: Joi.string()
    .uri()
    .optional()
    .description('TDX data source base URL (mist-datasource service)'),
});

/**
 * Schedule app-specific environment variable validation
 */
export const scheduleEnvSchema = commonEnvSchema.append({
  PORT: Joi.number().port().default(8003),
});
