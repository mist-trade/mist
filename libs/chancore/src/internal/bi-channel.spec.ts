import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanBiChannel } from '../contracts';
import { BiChannelCalculator } from './bi-channel';

function makeBi(trendIdx: number, base: number, range = 10): ChanBi {
  const isUp = trendIdx % 2 === 0;
  return {
    startTime: new Date(2024, 0, trendIdx + 1),
    endTime: new Date(2024, 0, trendIdx + 2),
    high: base + range,
    low: base,
    trend: isUp ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 5,
    originIds: [trendIdx * 2, trendIdx * 2 + 1],
    originData: [],
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      high: base + range,
      low: base,
      leftIds: [trendIdx * 2 - 1],
      middleIds: [trendIdx * 2],
      rightIds: [trendIdx * 2 + 1],
      middleIndex: trendIdx,
      middleOriginId: trendIdx * 2,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      high: base + range,
      low: base,
      leftIds: [trendIdx * 2],
      middleIds: [trendIdx * 2 + 1],
      rightIds: [trendIdx * 2 + 2],
      middleIndex: trendIdx + 1,
      middleOriginId: trendIdx * 2 + 1,
    },
  } as ChanBi;
}

function makeInvalidBi(trendIdx: number, base: number, range = 10): ChanBi {
  return { ...makeBi(trendIdx, base, range), status: BiStatus.Invalid };
}

function makeBiDirect(
  trendIdx: number,
  trend: TrendDirection,
  low: number,
  high: number,
): ChanBi {
  const isUp = trend === TrendDirection.Up;
  return {
    startTime: new Date(2024, 0, trendIdx + 1),
    endTime: new Date(2024, 0, trendIdx + 2),
    high,
    low,
    trend,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 5,
    originIds: [trendIdx * 2, trendIdx * 2 + 1],
    originData: [],
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      high,
      low,
      leftIds: [trendIdx * 2 - 1],
      middleIds: [trendIdx * 2],
      rightIds: [trendIdx * 2 + 1],
      middleIndex: trendIdx,
      middleOriginId: trendIdx * 2,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      high,
      low,
      leftIds: [trendIdx * 2],
      middleIds: [trendIdx * 2 + 1],
      rightIds: [trendIdx * 2 + 2],
      middleIndex: trendIdx + 1,
      middleOriginId: trendIdx * 2 + 1,
    },
  } as ChanBi;
}

describe('BiChannelCalculator (Batch 3 TDD - Pure Internal Bis & Scope Decoupling)', () => {
  let service: BiChannelCalculator;

  beforeEach(() => {
    service = new BiChannelCalculator();
  });

  function buildValidUpChannel(): ChanBi[] {
    return [
      makeBi(0, 50, 60), // b0 Up 50->110 (entry)
      makeBi(1, 90, 30), // b1 Down 90->120 (internal 1)
      makeBi(2, 85, 40), // b2 Up 85->125 (internal 2)
      makeBi(3, 95, 25), // b3 Down 95->120 (internal 3)
      makeBi(4, 95, 85), // b4 Up 95->180 (leave)
    ];
  }

  it('produces no channels when fewer than 5 bis', () => {
    const result = service.createBiChannels([
      makeBi(0, 100),
      makeBi(1, 100),
      makeBi(2, 100),
      makeBi(3, 100),
    ]);
    expect(result.phaseA).toHaveLength(0);
    expect(result.phaseB).toHaveLength(0);
  });

  it('strictly decouples entryBi, leaveBi, and stores ONLY pure internal bis in bis array', () => {
    const bis = buildValidUpChannel();
    const result = service.createBiChannels(bis);

    expect(result.phaseA.length).toBeGreaterThanOrEqual(1);
    const channel: ChanBiChannel = result.phaseA[0];

    // Core Principle: Macro 5 bis (1 entry + middle 3 + 1 exit)
    // bis array MUST strictly contain the 3 internal oscillation bis!
    expect(channel.bis).toHaveLength(3);
    expect(channel.bis[0]).toBe(bis[1]);
    expect(channel.bis[1]).toBe(bis[2]);
    expect(channel.bis[2]).toBe(bis[3]);

    // Entry and leave decoupled
    expect(channel.entryBi).toBe(bis[0]);
    expect(channel.leaveBi).toBe(bis[4]);

    // Strict geometry and level
    expect(channel.level).toBe(ChannelLevel.Bi);
    expect(channel.zg).toBeGreaterThan(channel.zd);
    expect(channel.gg).toBeGreaterThanOrEqual(channel.zg);
    expect(channel.dd).toBeLessThanOrEqual(channel.zd);

    // Physically purged displayStartId/displayEndId
    expect('displayStartId' in channel).toBe(false);
    expect('displayEndId' in channel).toBe(false);
    expect(channel.startId).toBe(bis[0].originIds[0]);
    expect(channel.endId).toBe(bis[4].originIds.at(-1));
  });

  it('excludes invalid Bi from calculation', () => {
    const valid = buildValidUpChannel();
    const invalid = makeInvalidBi(5, 105);
    expect(service.createBiChannels([...valid, invalid])).toEqual(
      service.createBiChannels(valid),
    );
  });

  it('supports uncompleted channel at tail with unsealed leaveBi', () => {
    // 4 bis: entry + 3 internal, but no leave confirmation yet
    const bis = [
      makeBi(0, 50, 60),
      makeBi(1, 90, 30),
      makeBi(2, 85, 40),
      makeBi(3, 95, 25),
    ];
    const result = service.createBiChannels(bis, { allowUncomplete: true });
    if (result.phaseA.length > 0) {
      const channel = result.phaseA[0];
      expect(channel.type).toBe(ChannelType.UnComplete);
      expect(channel.entryBi).toBe(bis[0]);
      expect(channel.bis).toHaveLength(3);
      expect(channel.leaveBi).toBeUndefined();
    }
  });

  it('performs dynamic narrowing on internal bis', () => {
    const bis = [
      makeBi(0, 50, 60), // b0 Up 50->110
      makeBi(1, 90, 30), // b1 Down 90->120 (range [90, 120])
      makeBi(2, 92, 25), // b2 Up 92->117 (range [92, 117])
      makeBi(3, 94, 20), // b3 Down 94->114 (range [94, 114])
      makeBi(4, 94, 86), // b4 Up 94->180 (breakout)
    ];
    const result = service.createBiChannels(bis);
    expect(result.phaseA.length).toBeGreaterThanOrEqual(1);
    const channel = result.phaseA[0];
    expect(channel.zd).toBe(94);
    expect(channel.zg).toBe(114);
  });

  describe('Sequential confirmation lifecycle and touch extension', () => {
    it('extends a base channel by pairs of touching bis and updates to dynamic common intersection (zg/zd)', () => {
      const bis: ChanBi[] = [
        makeBiDirect(0, TrendDirection.Up, 100, 120),
        makeBiDirect(1, TrendDirection.Down, 102, 120),
        makeBiDirect(2, TrendDirection.Up, 102, 118),
        makeBiDirect(3, TrendDirection.Down, 104, 118),
        makeBiDirect(4, TrendDirection.Up, 105, 118),
        makeBiDirect(5, TrendDirection.Down, 105, 117),
        makeBiDirect(6, TrendDirection.Up, 106, 117),
      ];
      const result = service.createBiChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];
      expect(channel.bis.length).toBeGreaterThanOrEqual(5);
      expect(channel.zg).toBe(117);
      expect(channel.zd).toBe(106);
      expect(channel.gg).toBe(120);
      expect(channel.dd).toBe(102);
      expect(channel.zg).toBeGreaterThan(channel.zd);
    });

    it('terminates extension when dynamic common intersection becomes empty (zg <= zd)', () => {
      const bis = [
        makeBi(0, 100, 20),
        makeBi(1, 101, 20),
        makeBi(2, 102, 20),
        makeBi(3, 103, 20),
        makeBi(4, 104, 20),
        makeBi(5, 75, 20),
        makeBi(6, 70, 20),
      ];
      const result = service.createBiChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      expect(result.phaseB[0].bis).toHaveLength(3);
    });

    it('5M 实盘经典用例一：01-07~01-13 第 1 号中枢避免 b[10] 假突破过早封存，消除 0.86 微型中枢并封存于 9 笔健康中枢', () => {
      const bis: ChanBi[] = [
        makeBiDirect(0, TrendDirection.Up, 4056.87, 4093.3),
        makeBiDirect(1, TrendDirection.Down, 4075.7, 4093.3),
        makeBiDirect(2, TrendDirection.Up, 4075.7, 4098.78),
        makeBiDirect(3, TrendDirection.Down, 4069.44, 4098.78),
        makeBiDirect(4, TrendDirection.Up, 4069.44, 4088.01),
        makeBiDirect(5, TrendDirection.Down, 4072.39, 4088.01),
        makeBiDirect(6, TrendDirection.Up, 4072.39, 4093.87),
        makeBiDirect(7, TrendDirection.Down, 4067.12, 4093.87),
        makeBiDirect(8, TrendDirection.Up, 4067.12, 4121.7),
        makeBiDirect(9, TrendDirection.Down, 4093.01, 4121.7),
        makeBiDirect(10, TrendDirection.Up, 4093.01, 4179.7),
      ];

      const result = service.createBiChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.bis).toHaveLength(7);
      expect(c.entryBi).toBeDefined();
      expect(c.leaveBi).toBeDefined();
      expect(c.zg).toBe(4088.01);
      expect(c.zd).toBe(4075.7);
      expect(c.gg).toBe(4098.78);
      expect(c.dd).toBe(4067.12);
    });

    it('5M 实盘经典用例二：01-21~01-26 1月22日中枢与后续高台阶中枢拆分，延伸至 01-26 14:35 (11 笔) 顺利封存，后续独立形成高台阶扩展中枢', () => {
      const bis: ChanBi[] = [
        makeBiDirect(0, TrendDirection.Up, 4109.92, 4140.84),
        makeBiDirect(1, TrendDirection.Down, 4112.86, 4140.84),
        makeBiDirect(2, TrendDirection.Up, 4112.86, 4127.82),
        makeBiDirect(3, TrendDirection.Down, 4109.92, 4127.82),
        makeBiDirect(4, TrendDirection.Up, 4109.92, 4139.95),
        makeBiDirect(5, TrendDirection.Down, 4120.2, 4139.95),
        makeBiDirect(6, TrendDirection.Up, 4120.2, 4143.75),
        makeBiDirect(7, TrendDirection.Down, 4120.63, 4143.75),
        makeBiDirect(8, TrendDirection.Up, 4120.63, 4160.99),
        makeBiDirect(9, TrendDirection.Down, 4124.7, 4160.99),
        makeBiDirect(10, TrendDirection.Up, 4124.7, 4145.97),
        makeBiDirect(11, TrendDirection.Down, 4101.83, 4145.97),
        makeBiDirect(12, TrendDirection.Up, 4101.83, 4158.8),
        makeBiDirect(13, TrendDirection.Down, 4135.11, 4158.8),
        makeBiDirect(14, TrendDirection.Up, 4135.11, 4161.8),
        makeBiDirect(15, TrendDirection.Down, 4139.15, 4161.8),
        makeBiDirect(16, TrendDirection.Up, 4139.15, 4170.15),
      ];

      const result = service.createBiChannels(bis);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(2);
      const c1 = result.phaseB[0];
      expect(c1.bis.length).toBeGreaterThanOrEqual(7);
      expect(c1.gg).toBe(4143.75);
      expect(c1.zg).toBe(4127.82);

      const c2 = result.phaseB[1];
      expect(c2.gg).toBeGreaterThanOrEqual(4160.99);
      expect(c2.zg).toBeGreaterThanOrEqual(4135);
    });
  });
});
