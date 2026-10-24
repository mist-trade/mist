import { normalizeExternalDecimalText } from '@app/decimal';
import { isValidDate } from '@app/utils';
import { KPriceProjector } from './k-price-projector';

import type {
  StrategyBar,
  StrategyBarType,
  StrategyMarketSource,
} from './strategy-bar';
import { DataSource, isVendorSource } from '@app/shared-data';
import { K } from '@app/shared-data';

/**
 * Historical K → canonical StrategyBar mapping.
 *
 * Unit contract: the MySQL `k` table already carries canonical units for both
 * sources — volume in shares, amount in CNY yuan — because unit conversion
 * happens once at the write layer (TDX amount 万元→元 in `TdxSource`,
 * QMT volume 手→股 in `QmtSource`; see extract-backtest-runtime design §quantity
 * profile). This mapper therefore only normalizes the DECIMAL(36,8) text and
 * performs no source-specific scaling.
 */
export function assertOhlcTopology(
  open: number,
  high: number,
  low: number,
  close: number,
): void {
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    low > high ||
    high < Math.max(open, close) ||
    low > Math.min(open, close)
  ) {
    throw new TypeError('OHLC relationship is invalid');
  }
}

export interface CanonicalStrategyBarInput {
  readonly securityId: number;
  readonly securityCode?: string;
  readonly source: StrategyMarketSource;
  readonly period: number;
  readonly timestamp: Date;
  readonly open: number | string;
  readonly high: number | string;
  readonly low: number | string;
  readonly close: number | string;
  readonly volume: string | null;
  readonly amount: string | null;
  readonly type?: StrategyBarType;
}

export function createCanonicalStrategyBar(
  input: CanonicalStrategyBarInput,
): StrategyBar {
  const open = KPriceProjector(input.open);
  const high = KPriceProjector(input.high);
  const low = KPriceProjector(input.low);
  const close = KPriceProjector(input.close);
  assertOhlcTopology(open, high, low, close);

  return Object.freeze({
    securityId: input.securityId,
    securityCode: input.securityCode,
    source: input.source,
    period: requirePositivePeriod(input.period),
    timestamp: requireTimestamp(input.timestamp),
    open,
    high,
    low,
    close,
    volume: mapHistoricalQuantity(input.volume),
    amount: mapHistoricalQuantity(input.amount),
    type: input.type ?? 'complete',
  });
}

export function mapKToStrategyBar(k: K): StrategyBar {
  const securityId = selectedSecurityId(k);
  return createCanonicalStrategyBar({
    securityId,
    securityCode: k.security?.code,
    source: mapSource(k.source),
    period: k.period,
    timestamp: k.timestamp,
    open: k.open as unknown as string | number,
    high: k.high as unknown as string | number,
    low: k.low as unknown as string | number,
    close: k.close as unknown as string | number,
    volume: k.volume,
    amount: k.amount,
    type: 'complete',
  });
}

function selectedSecurityId(k: K): number {
  const securityId = k.security?.id ?? k.securityId;
  if (!Number.isSafeInteger(securityId) || securityId <= 0) {
    throw new TypeError('historical strategy K requires a positive securityId');
  }
  return securityId;
}

function mapSource(source: DataSource): StrategyMarketSource {
  if (isVendorSource(source)) {
    return source as StrategyMarketSource;
  }
  switch (source) {
    case DataSource.EAST_MONEY:
      return 'ef';
    case DataSource.TDX:
      return 'tdx';
    case DataSource.QMT:
      return 'qmt';
  }
  throw new TypeError(
    `unsupported historical strategy source: ${String(source)}`,
  );
}

function mapHistoricalQuantity(value: string | null): string | null {
  if (value === null) return null;
  return normalizeExternalDecimalText(value);
}

function requireTimestamp(value: Date): Date {
  if (!isValidDate(value)) {
    throw new TypeError('historical strategy K requires a valid timestamp');
  }
  return new Date(value.getTime());
}

function requirePositivePeriod(period: number): number {
  if (!Number.isSafeInteger(period) || period <= 0) {
    throw new TypeError('historical strategy K requires a positive period');
  }
  return period;
}
