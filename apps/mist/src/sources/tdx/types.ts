import type { TdxExtension } from '../source-fetcher.interface';

export type { TdxExtension } from '../source-fetcher.interface';

/**
 * K-line data mapped from mist-datasource TDX /v1/bars/query.
 */
export interface TdxResponse {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  extensions?: TdxExtension;
}

export interface TdxDatasourceError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

export interface TdxEnvelope<T> {
  ok: boolean;
  requestId?: string;
  provider: string;
  data: T | null;
  meta: Record<string, unknown> | null;
  error: TdxDatasourceError | null;
}

export interface TdxNormalizedBar {
  symbol: string;
  period: string;
  barTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  provider: string;
  receivedAt: string;
  forwardFactor?: number | null;
  volInStock?: number | null;
}

export interface TdxNormalizedSnapshot {
  symbol: string;
  last: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  provider: string;
  asOf?: string;
  lastClose: number;
  raw?: Record<string, unknown>;
}

export interface TdxBarsResponseData {
  bars: TdxNormalizedBar[];
}

export interface TdxSnapshotsResponseData {
  snapshots: TdxNormalizedSnapshot[];
}

export interface TdxDividendFactorItem {
  symbol?: string;
  date?: string | null;
  forwardFactor?: number | null;
  backwardFactor?: number | null;
  provider?: string;
}

export interface TdxDividendFactorsResponseData {
  items: TdxDividendFactorItem[];
}

/**
 * Real-time snapshot mapped from mist-datasource TDX /v1/snapshots/query.
 */
export interface TdxSnapshot {
  code: string; // canonical internal code, e.g. "600519"
  formatCode: string; // provider transport code, e.g. "600519.SH"
  now: number; // current price
  open: number;
  high: number;
  low: number;
  lastClose: number; // previous close
  volume: number;
  amount: number;
  timestamp: Date;
  raw: Record<string, unknown>;
}
