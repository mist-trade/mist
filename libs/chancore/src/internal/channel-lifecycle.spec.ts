import { TrendDirection } from '../contracts';
import {
  ChannelLifecycleEngine,
  computeSymmetricGeometry,
  resolveChannelAnchorIds,
  validateTrendAlternating,
  type ChannelElement,
  type ChannelLifecycleStrategy,
} from './channel-lifecycle';

interface MockElement extends ChannelElement {
  id: number;
}

function makeElem(
  id: number,
  trend: TrendDirection,
  low: number,
  high: number,
): MockElement {
  return {
    id,
    trend,
    low,
    high,
    originIds: [id * 10, id * 10 + 1, id * 10 + 2],
  };
}

describe('ChannelLifecycle Utilities & Engine', () => {
  describe('validateTrendAlternating', () => {
    it('returns true when trends alternate strictly', () => {
      const items = [
        makeElem(0, TrendDirection.Up, 0, 10),
        makeElem(1, TrendDirection.Down, 2, 8),
        makeElem(2, TrendDirection.Up, 3, 9),
      ];
      expect(validateTrendAlternating(items)).toBe(true);
    });

    it('returns false when adjacent items share the same trend', () => {
      const items = [
        makeElem(0, TrendDirection.Up, 0, 10),
        makeElem(1, TrendDirection.Up, 2, 8),
      ];
      expect(validateTrendAlternating(items)).toBe(false);
    });
  });

  describe('computeSymmetricGeometry', () => {
    it('computes [zd, zg, dd, gg] correctly for overlapping elements', () => {
      const items = [
        makeElem(0, TrendDirection.Up, 0, 10),
        makeElem(1, TrendDirection.Down, 2, 8),
        makeElem(2, TrendDirection.Up, 3, 9),
      ];
      const geo = computeSymmetricGeometry(items);
      expect(geo).toEqual({
        zg: 8,
        zd: 3,
        gg: 10,
        dd: 0,
      });
    });

    it('returns null when overlap is degenerate (zg <= zd)', () => {
      const items = [
        makeElem(0, TrendDirection.Up, 0, 5),
        makeElem(1, TrendDirection.Down, 5, 10),
        makeElem(2, TrendDirection.Up, 6, 12),
      ];
      expect(computeSymmetricGeometry(items)).toBeNull();
    });
  });

  describe('resolveChannelAnchorIds', () => {
    it('picks correct startId, endId, displayStartId, displayEndId', () => {
      const items = [
        makeElem(0, TrendDirection.Up, 0, 10),
        makeElem(1, TrendDirection.Down, 2, 8),
        makeElem(2, TrendDirection.Up, 3, 9),
      ];
      const ids = resolveChannelAnchorIds(items, 0, 2);
      expect(ids).toEqual({
        startId: 0,
        endId: 22,
        displayStartId: 1, // middle of [0, 1, 2]
        displayEndId: 21, // middle of [20, 21, 22]
      });
    });
  });

  describe('Bidirectional Rules 1..4 in Lifecycle Engine', () => {
    const mockStrategy: ChannelLifecycleStrategy<MockElement, any> = {
      minCoreLength: 3,
      minSealedLength: 3,
      validateCore: (window) => {
        const geo = computeSymmetricGeometry(window);
        if (!geo) return null;
        return { geometry: geo, isUp: window[0].trend === TrendDirection.Up };
      },
      buildPhaseAChannel: (elements, _original, _startIndex, coreGeometry) => ({
        count: elements.length,
        coreGeometry,
      }),
      buildSealedChannel: (
        elements,
        _original,
        _startIndex,
        geometry,
        expanded,
      ) => ({
        count: elements.length,
        geometry,
        expanded,
      }),
    };

    it('Down Central: Rule 1 seals when 3S forms and stroke1 breaks below DD', () => {
      // Core: d0 Down (100 -> 85), d1 Up (85 -> 95), d2 Down (75 -> 90) -> zg=90, zd=85, dd=75, gg=100
      // d3 Up (75 -> 88) retracement
      // d4 Down (60 -> 88) breakout below DD(75) to 60!
      // d5 Up (60 -> 82) pullback stays below ZD(85) -> 3S!
      // d6 Down (50 -> 82) stroke1 after 3S breaks below 60 to 50 -> Rule 1!
      const duans = [
        makeElem(0, TrendDirection.Down, 85, 100),
        makeElem(1, TrendDirection.Up, 85, 95),
        makeElem(2, TrendDirection.Down, 75, 90),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 60, 82),
        makeElem(6, TrendDirection.Down, 50, 82),
      ];

      const res = ChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5); // [d0..d4]
      expect(c.geometry.dd).toBe(60);
    });

    it('Down Central: Rule 2 seals when 3S forms and stroke2 pierces ZG (90)', () => {
      // d4 Down to 60 (breakout)
      // d5 Up to 78 (3S)
      // d6 Down to 65 (fails to make new low)
      // d7 Up to 95 (pierces ZG=90) -> Rule 2!
      const duans = [
        makeElem(0, TrendDirection.Down, 80, 100),
        makeElem(1, TrendDirection.Up, 80, 95),
        makeElem(2, TrendDirection.Down, 75, 95),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 60, 78),
        makeElem(6, TrendDirection.Down, 65, 78),
        makeElem(7, TrendDirection.Up, 65, 95),
      ];

      const res = ChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5);
      expect(c.geometry.dd).toBe(60);
    });

    it('Down Central: Rule 3 seals when No 3S and pullback pierces ZG (90)', () => {
      // d4 Down to 60 (breakout)
      // d5 Up to 105 (no 3S, directly pierces GG=100!) -> Rule 3!
      const duans = [
        makeElem(0, TrendDirection.Down, 80, 100),
        makeElem(1, TrendDirection.Up, 80, 95),
        makeElem(2, TrendDirection.Down, 75, 95),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 60, 105),
      ];

      const res = ChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5);
      expect(c.geometry.dd).toBe(60);
    });

    it('Down Central: Rule 4 seals when new core forms after breakout', () => {
      // d4 Down to 60 (breakout)
      // d5 Up (50 -> 68)
      // d6 Down (45 -> 65)
      // [d4, d5, d6] forms new core [45, 68]
      const duans = [
        makeElem(0, TrendDirection.Down, 80, 100),
        makeElem(1, TrendDirection.Up, 80, 95),
        makeElem(2, TrendDirection.Down, 75, 95),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 50, 68),
        makeElem(6, TrendDirection.Down, 45, 65),
      ];

      const res = ChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5);
      expect(c.geometry.dd).toBe(60);
    });
  });
});
