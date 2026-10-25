import { DataSource } from '@app/shared-data';
import type { K } from '@app/shared-data';
import { prepareMarketData } from './market-data-pipeline';
import { mapKToStrategyBar } from './k-strategy-bar-mapper';

/**
 * Source-mapping guard.
 *
 * Every persisted `k.source` value must survive both translation points:
 *   - `prepareMarketData` (indicator / visual / strategy pipeline)
 *   - `mapKToStrategyBar` (historical replay mapping)
 *
 * The failure mode is silent: an unmapped source returns null and the bar is
 * dropped, so the SQL hits rows but the HTTP response is `data: []` with no log.
 * Production hit exactly this for `vendor_a` on 2026-10-24.
 */
// `canonical` is a backtest run marker, never a persisted k.source value.
const PERSISTED_SOURCES = Object.values(DataSource).filter(
  (source) => source !== DataSource.CANONICAL,
);

function kRow(source: string): K {
  return {
    id: 1,
    security: { id: 5, code: '000001' } as never,
    securityId: 5,
    source: source as never,
    period: 30,
    timestamp: new Date(Date.UTC(2026, 8, 29, 2, 0)),
    open: '3900.00' as unknown as number,
    high: '3905.00' as unknown as number,
    low: '3895.00' as unknown as number,
    close: '3902.00' as unknown as number,
    volume: '100.00000000',
    amount: '100.00000000',
  } as unknown as K;
}

describe('source mapping guard', () => {
  it.each(PERSISTED_SOURCES)(
    'prepareMarketData keeps %s bars instead of dropping them',
    (source) => {
      const out = prepareMarketData({
        rawBars: [kRow(source)],
        period: 30,
        requiredBars: 1,
      });

      expect(out.droppedKlines).toBe(0);
      expect(out.projected).toHaveLength(1);
      expect(out.projected[0].rawBar.source).toBe(source);
    },
  );

  it.each(PERSISTED_SOURCES)(
    'mapKToStrategyBar maps %s without throwing',
    (source) => {
      const bar = mapKToStrategyBar(kRow(source));
      expect(bar.source).toBe(source);
    },
  );

  it('still drops a source outside the enum', () => {
    const out = prepareMarketData({
      rawBars: [kRow('mystery')],
      period: 30,
      requiredBars: 1,
    });

    expect(out.droppedKlines).toBe(1);
    expect(out.projected).toHaveLength(0);
  });

  it('still rejects a source outside the enum in the historical mapper', () => {
    expect(() => mapKToStrategyBar(kRow('mystery'))).toThrow(
      /unsupported historical strategy source/,
    );
  });
});
