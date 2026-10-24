import { DataSource } from './enums/data-source.enum';

/**
 * Every third-party provider is its own source value with this prefix.
 * Adding a provider is an enum value plus a migration, nothing else.
 */
export const VENDOR_SOURCE_PREFIX = 'vendor_';

export function isVendorSource(source: string): boolean {
  return source.startsWith(VENDOR_SOURCE_PREFIX);
}

/**
 * Sources a backtest run may replay. Derived from the enum so registering a new
 * vendor source automatically makes it selectable.
 */
export const BACKTEST_SOURCES: readonly DataSource[] = Object.values(
  DataSource,
).filter(
  (source) =>
    source === DataSource.TDX ||
    source === DataSource.QMT ||
    isVendorSource(source),
);

export function isBacktestSource(source: string): boolean {
  return BACKTEST_SOURCES.includes(source as DataSource);
}
