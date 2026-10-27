import {
  InMemoryReplayPort,
  ReplaySeriesMissingError,
} from './in-memory-replay-port';
import type { StrategyBar } from '@app/market-data';

const T0 = new Date('2026-01-05T01:00:00.000Z'); // 上海 09:00（session 外，纯时序用）

function bar(period: number, offsetMinutes: number, close = 100): StrategyBar {
  return Object.freeze({
    securityId: 1,
    securityCode: '000001',
    source: 'qmt',
    period,
    timestamp: new Date(T0.getTime() + offsetMinutes * 60_000),
    open: close,
    high: close,
    low: close,
    close,
    volume: null,
    amount: null,
    type: 'complete',
  });
}

function series(period: number, count: number, stepMinutes: number) {
  return Array.from({ length: count }, (_, i) => bar(period, i * stepMinutes));
}

describe('InMemoryReplayPort', () => {
  describe('construction guards (fail-closed)', () => {
    it('rejects missing/empty period series with a sync hint', () => {
      expect(
        () =>
          new InMemoryReplayPort({
            securityId: 1,
            securityCode: '000001',
            series: new Map([
              [30, series(30, 5, 30)],
              [1440, []],
            ]),
          }),
      ).toThrow(ReplaySeriesMissingError);
      try {
        new InMemoryReplayPort({
          securityId: 1,
          securityCode: '000001',
          series: new Map([
            [30, series(30, 5, 30)],
            [1440, []],
          ]),
        });
      } catch (error) {
        expect((error as ReplaySeriesMissingError).missingPeriods).toEqual([
          1440,
        ]);
        expect((error as Error).message).toContain('dev:sync');
        expect((error as Error).message).toContain('1d');
      }
    });

    it('rejects non-ascending series', () => {
      const bars = [bar(30, 60), bar(30, 30)];
      expect(
        () =>
          new InMemoryReplayPort({
            securityId: 1,
            series: new Map([[30, bars]]),
          }),
      ).toThrow(/strictly ascending/);
    });
  });

  describe('loadReplayWindow', () => {
    it('takes the last requiredBars strictly before endAt', async () => {
      const bars = series(30, 10, 30); // 0..270min
      const port = new InMemoryReplayPort({
        securityId: 1,
        series: new Map([[30, bars]]),
      });
      const endAt = new Date(T0.getTime() + 240 * 60_000); // exclusive
      const window = await port.loadReplayWindow({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        endAt,
        requiredBars: 3,
      });
      expect(window.bars).toHaveLength(3);
      expect(window.bars[0].timestamp.getTime()).toBe(
        T0.getTime() + 150 * 60_000,
      );
      expect(window.bars[2].timestamp.getTime()).toBe(
        T0.getTime() + 210 * 60_000,
      );
    });

    it('returns fewer bars when history is shorter than demand', async () => {
      const bars = series(30, 2, 30);
      const port = new InMemoryReplayPort({
        securityId: 1,
        series: new Map([[30, bars]]),
      });
      // endAt = T0+10min：仅 bar0（T0）严格早于 endAt，bar1（T0+30min）不入窗
      const window = await port.loadReplayWindow({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        endAt: new Date(T0.getTime() + 10 * 60_000),
        requiredBars: 300,
      });
      expect(window.bars).toHaveLength(1);
      expect(window.bars[0].timestamp).toEqual(bars[0].timestamp);

      // endAt = T0：无任何 bar 严格早于 endAt → 空窗
      const empty = await port.loadReplayWindow({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        endAt: new Date(T0.getTime()),
        requiredBars: 300,
      });
      expect(empty.bars).toHaveLength(0);
    });
  });

  describe('readReplayPage', () => {
    it('pages from startAt inclusively and terminates with null', async () => {
      const bars = series(30, 7, 30);
      const port = new InMemoryReplayPort({
        securityId: 1,
        series: new Map([[30, bars]]),
        pageSize: 3,
      });
      const startAt = bars[0].timestamp;
      const endAt = bars[bars.length - 1].timestamp;

      const page1 = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt,
        endAt,
      });
      expect(page1.bars).toHaveLength(3);
      expect(page1.nextAfterTimestamp).toEqual(page1.bars[2].timestamp);

      const page2 = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt,
        endAt,
        afterTimestamp: page1.nextAfterTimestamp!,
      });
      expect(page2.bars).toHaveLength(3);
      expect(page2.nextAfterTimestamp).toEqual(page2.bars[2].timestamp);

      const page3 = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt,
        endAt,
        afterTimestamp: page2.nextAfterTimestamp!,
      });
      expect(page3.bars).toHaveLength(1);
      // 未满页 → 直接判定耗尽
      expect(page3.nextAfterTimestamp).toBeNull();
    });

    it('never repeats the previous page tail (strictly after afterTimestamp)', async () => {
      const bars = series(30, 5, 30);
      const port = new InMemoryReplayPort({
        securityId: 1,
        series: new Map([[30, bars]]),
        pageSize: 2,
      });
      const page1 = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt: bars[0].timestamp,
        endAt: bars[4].timestamp,
      });
      const page2 = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt: bars[0].timestamp,
        endAt: bars[4].timestamp,
        afterTimestamp: page1.nextAfterTimestamp!,
      });
      expect(page2.bars[0].timestamp.getTime()).toBe(
        page1.bars[1].timestamp.getTime() + 30 * 60_000,
      );
    });

    it('stops paging at endAt even when a full page is available', async () => {
      const bars = [...series(30, 6, 30), ...series(1440, 3, 1440)];
      const port = new InMemoryReplayPort({
        securityId: 1,
        series: new Map([
          [30, bars.slice(0, 6)],
          [1440, bars.slice(6)],
        ]),
        pageSize: 4,
      });
      // 30m 序列在 endAt 后仍有数据行，但 endAt 截断 → 耗尽
      const page = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt: bars[0].timestamp,
        endAt: bars[3].timestamp,
      });
      expect(page.bars).toHaveLength(4);
      expect(page.nextAfterTimestamp).toBeNull();
    });

    it('returns an empty page when startAt is beyond the data', async () => {
      const bars = series(30, 3, 30);
      const port = new InMemoryReplayPort({
        securityId: 1,
        series: new Map([[30, bars]]),
      });
      const page = await port.readReplayPage({
        securityId: 1,
        selection: { kind: 'canonical' },
        period: 30,
        startAt: new Date(T0.getTime() + 1000 * 60_000),
        endAt: new Date(T0.getTime() + 2000 * 60_000),
      });
      expect(page.bars).toHaveLength(0);
      expect(page.nextAfterTimestamp).toBeNull();
    });
  });
});
