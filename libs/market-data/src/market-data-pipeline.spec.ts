import type { K } from '@app/shared-data';
import { prepareMarketData } from './market-data-pipeline';

// 阈值冻结：pipeline 的 requested/dropped/effective + resolutionCounts 对账不变量
// DO NOT CHANGE：历史/实时/展示/指标 4 端经同一 pipeline 必须一致
describe('MarketDataPipeline — 历史路径一致性冻结', () => {
  const baseK = (overrides: Partial<K> & { timestamp: Date }): K =>
    ({
      id: 1,
      security: { id: 1, code: '000001' } as any,
      securityId: 1,
      source: 'tdx' as any,
      period: 5,
      open: '10.00' as unknown as number,
      high: '10.00' as unknown as number,
      low: '10.00' as unknown as number,
      close: '10.00' as unknown as number,
      volume: '100.00000000',
      amount: '100.00000000',
      ...overrides,
    }) as unknown as K;

  it('同一窗口经 pipeline 的 requested/dropped/effective 一致', () => {
    const ks: K[] = [
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 0)),
        open: '10.00' as unknown as number,
      }),
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 5)),
        open: '1.200' as unknown as number,
      }),
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 10)),
        open: '10.00' as unknown as number,
      }),
    ];
    const out = prepareMarketData({ rawBars: ks, period: 5, requiredBars: 3 });
    expect(out.requestedKlines).toBe(3);
    expect(out.droppedKlines).toBe(0);
    expect(out.effectiveKlines).toBe(3);
    expect(out.diagnostics.resolutionCounts.observed).toBe(3);
  });

  it('精度门控丢弃不作补齐锚点（脏K不传染）', () => {
    const ks: K[] = [
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 0)),
        open: '10.00' as unknown as number,
      }),
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 5)),
        open: 'not-a-number' as unknown as number,
      }),
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 10)),
        open: '10.00' as unknown as number,
      }),
    ];
    const out = prepareMarketData({ rawBars: ks, period: 5, requiredBars: 3 });
    expect(out.droppedKlines).toBe(1);
    expect(out.effectiveKlines).toBe(2);
  });

  it('0 为有效锚点，null/NaN 才进 backfilled/forwardFilled', () => {
    const ks: K[] = [
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 0)),
        open: '0.00' as unknown as number,
      }),
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 5)),
        open: '10.00' as unknown as number,
      }),
    ];
    const out = prepareMarketData({ rawBars: ks, period: 5, requiredBars: 2 });
    expect(out.diagnostics.resolutionCounts.observed).toBe(2);
  });

  it('超最大整数 clamp 后不丢弃', () => {
    const ks: K[] = [
      baseK({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 0)),
        open: '9999999999999999999.99' as unknown as number,
      }),
    ];
    const out = prepareMarketData({ rawBars: ks, period: 5, requiredBars: 1 });
    expect(out.droppedKlines).toBe(0);
    expect(out.effectiveKlines).toBe(1);
  });
});

describe('MarketDataPipeline — 第三方源', () => {
  const vendorK = (overrides: Partial<K> & { timestamp: Date }): K =>
    ({
      id: 1,
      security: { id: 1, code: '000001' } as any,
      securityId: 1,
      source: 'vendor_a' as any,
      period: 30,
      open: '3900.00' as unknown as number,
      high: '3905.00' as unknown as number,
      low: '3895.00' as unknown as number,
      close: '3902.00' as unknown as number,
      volume: '100.00000000',
      amount: '100.00000000',
      ...overrides,
    }) as unknown as K;

  it('保留 vendor_* 源的 bar，不静默丢弃', () => {
    const out = prepareMarketData({
      rawBars: [vendorK({ timestamp: new Date(Date.UTC(2026, 8, 29, 2, 0)) })],
      period: 30,
      requiredBars: 1,
    });

    expect(out.requestedKlines).toBe(1);
    expect(out.droppedKlines).toBe(0);
    expect(out.projected).toHaveLength(1);
    expect(out.projected[0].rawBar.source).toBe('vendor_a');
  });

  it('未知来源仍被丢弃', () => {
    const out = prepareMarketData({
      rawBars: [
        vendorK({
          timestamp: new Date(Date.UTC(2026, 8, 29, 2, 0)),
          source: 'mystery' as any,
        }),
      ],
      period: 30,
      requiredBars: 1,
    });

    expect(out.droppedKlines).toBe(1);
    expect(out.projected).toHaveLength(0);
  });
});
