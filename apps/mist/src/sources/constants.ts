export const DATASOURCE_HTTP_TIMEOUT_MS = 30000;
export const DEFAULT_WS_RECONNECT_DELAY_MS = 5000;
export const DEFAULT_SUBSCRIPTION_CONTROL_TIMEOUT_MS = 10000;
export const DEFAULT_QMT_BASE_URL = 'http://127.0.0.1:9002';
export const DEFAULT_TDX_BASE_URL = 'http://127.0.0.1:9001';
export const DEFAULT_QMT_WS_CLIENT_ID = 'mist-backend-qmt-realtime';
export const DEFAULT_TDX_WS_CLIENT_ID = 'mist-backend-tdx-realtime';

export const CONTROL_REQUEST_TYPES = Object.freeze({
  SYNC_SUBSCRIPTIONS: 'sync_subscriptions',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  GET_SUBSCRIPTIONS: 'get_subscriptions',
} as const);

export const CONTROL_RESPONSE_TYPES = Object.freeze({
  SUBSCRIPTIONS_SYNCED: 'subscriptions_synced',
  SUBSCRIBED: 'subscribed',
  UNSUBSCRIBED: 'unsubscribed',
  SUBSCRIPTIONS: 'subscriptions',
} as const);
