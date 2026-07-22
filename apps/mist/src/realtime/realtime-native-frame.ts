export type RealtimeSource = 'tdx' | 'qmt';

export interface RealtimeNativeFrame {
  payloadType: 'mist.realtime.native_snapshot';
  schemaVersion: 1;
  source: RealtimeSource;
  acquisitionProfile: 'tdx.get_market_snapshot' | 'qmt.get_full_tick';
  streamEpoch: string;
  sequence: number;
  sequenceScope: 'symbol';
  symbol: string;
  capturedAt: string;
  native: Record<string, unknown>;
}

export interface CanonicalRealtimeSnapshot {
  source: RealtimeSource;
  symbol: string;
  eventTime: string | null;
  capturedAt: string;
  sequence: number;
  streamEpoch: string;
  prices: {
    last: number;
    open: number | null;
    high: number | null;
    low: number | null;
    lastClose: number | null;
  };
  cumulativeVolume: number | null;
  cumulativeAmount: number | null;
  quality: {
    eventTimeAvailable: boolean;
    partialPrices: boolean;
  };
  native: Record<string, unknown>;
}

export const REALTIME_NATIVE_CONTRACT = {
  payloadType: 'mist.realtime.native_snapshot',
  schemaVersion: 1,
  sequenceScope: 'symbol',
  acquisitionProfiles: {
    tdx: 'tdx.get_market_snapshot',
    qmt: 'qmt.get_full_tick',
  },
} as const;
