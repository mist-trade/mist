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
  forwardFactor?: number;
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
  forwardFactor?: number;
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
}

export interface TdxBarsResponseData {
  bars: TdxNormalizedBar[];
}

export interface TdxSnapshotsResponseData {
  snapshots: TdxNormalizedSnapshot[];
}

/**
 * Real-time snapshot mapped from mist-datasource TDX /v1/snapshots/query.
 */
export interface TdxSnapshot {
  stockCode: string; // e.g., "SH600519"
  now: number; // current price
  open: number;
  high: number;
  low: number;
  lastClose: number; // previous close
  volume: number;
  amount: number;
  timestamp: Date;
}

/**
 * TDX K-line extension fields
 * Maps to KExtensionTdx entity in @app/shared-data
 */
export interface TdxExtension {
  fullCode?: string;
  forwardFactor?: number;
  backwardFactor?: number;
  volumeRatio?: number;
  turnoverRate?: number;
  turnoverAmount?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
  earningsPerShare?: number;
  priceEarningsRatio?: number;
  priceToBookRatio?: number;
}
