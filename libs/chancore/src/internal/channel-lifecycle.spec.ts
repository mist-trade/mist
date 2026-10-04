import { TrendDirection } from '../contracts';
import {
  BiChannelLifecycleEngine,
  BiStateMachine,
  computeSymmetricGeometry,
  resolveChannelAnchorIds,
  validateTrendAlternating,
  type ChannelElement,
  type BiChannelLifecycleStrategy,
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

describe('ChannelLifecycle Utilities & BiStateMachine Engine (Batch 2 TDD)', () => {
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

  describe('resolveChannelAnchorIds (Physically purged displayStartId/displayEndId)', () => {
    it('picks correct startId and endId, and strictly omits displayStartId/displayEndId', () => {
      const items = [
        makeElem(0, TrendDirection.Up, 0, 10),
        makeElem(1, TrendDirection.Down, 2, 8),
        makeElem(2, TrendDirection.Up, 3, 9),
      ];
      const ids = resolveChannelAnchorIds(items, 0, 2);
      expect(ids).toEqual({
        startId: 0,
        endId: 22,
      });
      expect('displayStartId' in ids).toBe(false);
      expect('displayEndId' in ids).toBe(false);
    });
  });

  describe('BiStateMachine direct unit tests', () => {
    it('initializes with 4-element core and manages candidate departures', () => {
      const core = [
        makeElem(0, TrendDirection.Up, 0, 10),
        makeElem(1, TrendDirection.Down, 2, 8),
        makeElem(2, TrendDirection.Up, 3, 9),
        makeElem(3, TrendDirection.Down, 4, 8),
      ];
      const fsm = new BiStateMachine<MockElement>(0, core, {
        geometry: { zg: 8, zd: 4, gg: 10, dd: 0 },
        isUp: true,
      });

      expect(fsm.zg).toBe(8);
      expect(fsm.zd).toBe(4);
      expect(fsm.isComplete).toBe(false);

      const candidateBi = makeElem(4, TrendDirection.Up, 5, 15);
      const recorded = fsm.recordCandidateDeparture(candidateBi, 4, 15, 0);
      expect(recorded).not.toBeNull();
      expect(fsm.candidateDepartures).toHaveLength(1);

      fsm.sealAtLatestCandidate();
      expect(fsm.isComplete).toBe(true);
    });
  });

  describe('Bidirectional Rules in BiChannelLifecycleEngine', () => {
    const mockStrategy: BiChannelLifecycleStrategy<MockElement, any> = {
      allowUncomplete: false,
      validateCore: (window) => {
        const geo = computeSymmetricGeometry(window.slice(1));
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
      const duans = [
        makeElem(0, TrendDirection.Down, 85, 100),
        makeElem(1, TrendDirection.Up, 85, 95),
        makeElem(2, TrendDirection.Down, 75, 90),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 60, 82),
        makeElem(6, TrendDirection.Down, 50, 82),
      ];

      const res = BiChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5); // [d0..d4]
      expect(c.geometry.dd).toBe(75);
    });

    it('Down Central: Rule 2 seals when 3S forms and stroke2 pierces ZG (90)', () => {
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

      const res = BiChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5);
      expect(c.geometry.dd).toBe(75);
    });

    it('Down Central: Rule 3 seals when No 3S and pullback pierces ZG (90)', () => {
      const duans = [
        makeElem(0, TrendDirection.Down, 80, 100),
        makeElem(1, TrendDirection.Up, 80, 95),
        makeElem(2, TrendDirection.Down, 75, 95),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 60, 105),
      ];

      const res = BiChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5);
      expect(c.geometry.dd).toBe(75);
    });

    it('Down Central: Rule 4 seals when new core forms after breakout', () => {
      const duans = [
        makeElem(0, TrendDirection.Down, 80, 100),
        makeElem(1, TrendDirection.Up, 80, 95),
        makeElem(2, TrendDirection.Down, 75, 95),
        makeElem(3, TrendDirection.Up, 75, 88),
        makeElem(4, TrendDirection.Down, 60, 88),
        makeElem(5, TrendDirection.Up, 50, 68),
        makeElem(6, TrendDirection.Down, 45, 65),
      ];

      const res = BiChannelLifecycleEngine.runSequentialLifecycle(
        duans,
        mockStrategy,
      );
      expect(res.sequential.length).toBeGreaterThanOrEqual(1);
      const c = res.sequential[0];
      expect(c.count).toBe(5);
      expect(c.geometry.dd).toBe(75);
    });
  });
});
