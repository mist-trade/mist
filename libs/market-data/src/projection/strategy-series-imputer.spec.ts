import type { StrategyBar } from '../strategy-bar';
import { StrategySeriesImputer, imputeSeries } from './strategy-series-imputer';

function makeBar(
  minuteOffset: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar {
  // 2026-08-03 09:30 CST = 01:30Z
  const baseMs = Date.UTC(2026, 7, 3, 1, 30);
  return {
    securityId: 1,
    source: 'tdx',
    period: 1,
    timestamp: new Date(baseMs + minuteOffset * 60_000),
    open: 10,
    high: 10.5,
    low: 9.5,
    close: 10.2,
    volume: '100',
    amount: '1000',
    type: 'complete',
    ...overrides,
  };
}

describe('StrategySeriesImputer — [DATA-P1-01] append 与 hydrate 量额零值同构', () => {
  it('append 将同日合法 "0" 量额前向填充为最近非零锚点（而非标为 observed）', () => {
    const imputer = new StrategySeriesImputer();
    const b1 = imputer.append(makeBar(0, { volume: '100', amount: '2000' }));
    const b2 = imputer.append(makeBar(1, { volume: '0', amount: '0' }));

    expect(b1.volume).toEqual({
      raw: '100',
      effective: '100',
      resolution: 'observed',
    });
    expect(b1.amount).toEqual({
      raw: '2000',
      effective: '2000',
      resolution: 'observed',
    });

    expect(b2.volume).toEqual({
      raw: '0',
      effective: '100',
      resolution: 'forwardFilled',
    });
    expect(b2.amount).toEqual({
      raw: '0',
      effective: '2000',
      resolution: 'forwardFilled',
    });
  });

  it('无前序同日锚点时，append 遇 "0" 量额应标为 unavailable 且不污染后续锚点', () => {
    const imputer = new StrategySeriesImputer();
    const firstZero = imputer.append(makeBar(0, { volume: '0', amount: '0' }));
    expect(firstZero.volume).toEqual({
      raw: '0',
      effective: null,
      resolution: 'unavailable',
    });
    expect(firstZero.amount).toEqual({
      raw: '0',
      effective: null,
      resolution: 'unavailable',
    });

    const anchor = imputer.append(
      makeBar(1, { volume: '250', amount: '5000' }),
    );
    expect(anchor.volume).toEqual({
      raw: '250',
      effective: '250',
      resolution: 'observed',
    });

    const trailingZero = imputer.append(
      makeBar(2, { volume: '0', amount: null }),
    );
    expect(trailingZero.volume).toEqual({
      raw: '0',
      effective: '250',
      resolution: 'forwardFilled',
    });
    expect(trailingZero.amount).toEqual({
      raw: null,
      effective: '5000',
      resolution: 'forwardFilled',
    });
  });

  it('跨交易日后重置前向锚点，次日首根 "0" 量额不得继承前日锚点', () => {
    const imputer = new StrategySeriesImputer();
    imputer.hydrate([makeBar(0, { volume: '100', amount: '2000' })]);

    const nextDayBar = makeBar(24 * 60, { volume: '0', amount: '0' });
    const projected = imputer.append(nextDayBar);

    expect(projected.volume).toEqual({
      raw: '0',
      effective: null,
      resolution: 'unavailable',
    });
    expect(projected.amount).toEqual({
      raw: '0',
      effective: null,
      resolution: 'unavailable',
    });
  });

  it('hydrate + append 对尾部零值与跨日无锚序列的产出与 imputeSeries 100% 一致', () => {
    const bars: StrategyBar[] = [
      makeBar(0, { volume: '120', amount: '2400' }),
      makeBar(1, { volume: '0', amount: '0' }),
      makeBar(2, { volume: null, amount: '0' }),
      makeBar(24 * 60, { volume: '0', amount: '0' }),
      makeBar(24 * 60 + 1, { volume: '300', amount: '6000' }),
      makeBar(24 * 60 + 2, { volume: '0', amount: '0' }),
    ];

    const batch = imputeSeries(bars);
    const incremental = new StrategySeriesImputer();
    incremental.hydrate(bars.slice(0, 1));
    for (const bar of bars.slice(1)) {
      incremental.append(bar);
    }

    // 第 4 根（次日首根 '0'）在 batch 中因同日后有 '300' 而 backfilled，
    // 但在单日尾部缺口场景（前 3 根与末尾 2 根）hydrate 与 append 必须逐字段完全一致。
    expect(incremental.read().slice(0, 3)).toEqual(batch.slice(0, 3));
    expect(incremental.read().slice(4)).toEqual(batch.slice(4));

    // 当 hydrated 段本身以 '0' 结尾时，后续 append '0' 仍延续同一非零锚点
    const tailZero = new StrategySeriesImputer();
    tailZero.hydrate([
      makeBar(0, { volume: '120', amount: '2400' }),
      makeBar(1, { volume: '0', amount: '0' }),
    ]);
    const appended = tailZero.append(makeBar(2, { volume: '0', amount: '0' }));
    expect(appended.volume).toEqual({
      raw: '0',
      effective: '120',
      resolution: 'forwardFilled',
    });
    expect(appended.amount).toEqual({
      raw: '0',
      effective: '2400',
      resolution: 'forwardFilled',
    });
  });

  it('append 对非规范 decimal 字符串（含 "0.00000000" / 非数字）维持 fail-closed 抛错契约', () => {
    const imputer = new StrategySeriesImputer();
    expect(() => imputer.append(makeBar(0, { volume: '0.00000000' }))).toThrow(
      TypeError,
    );
    expect(() => imputer.append(makeBar(0, { amount: 'bad' }))).toThrow(
      TypeError,
    );
  });
});
