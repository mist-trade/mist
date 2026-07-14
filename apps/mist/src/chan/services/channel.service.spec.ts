import { Test, TestingModule } from '@nestjs/testing';
import { ChannelService } from './channel.service';
import {
  ChannelLevel,
  ChannelStatus,
  ChannelType,
} from '../enums/channel.enum';
import { TrendDirection } from '../enums/trend-direction.enum';
import { BiStatus, BiType } from '../enums/bi.enum';
import { BiVo } from '../vo/bi.vo';
import { FenxingType } from '../enums/fenxing.enum';
import { ChannelVo } from '../vo/channel.vo';

/**
 * 构造一个用于中枢测试的笔。
 *
 * trendIdx 为偶数 → 向上笔（lowest=base, highest=base+range）；
 * trendIdx 为奇数 → 向下笔（highest=base+range, lowest=base）。
 * 通过 base 的递增/递减，让相邻笔构成可重叠的震荡，便于形成 zg>zd 的中枢。
 */
function makeBi(trendIdx: number, base: number, range = 10): BiVo {
  const isUp = trendIdx % 2 === 0;
  return {
    startTime: new Date(2024, 0, trendIdx + 1),
    endTime: new Date(2024, 0, trendIdx + 2),
    highest: base + range,
    lowest: base,
    trend: isUp ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 5,
    originIds: [trendIdx * 2, trendIdx * 2 + 1],
    originData: [],
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      highest: base + range,
      lowest: base,
      leftIds: [trendIdx * 2 - 1],
      middleIds: [trendIdx * 2],
      rightIds: [trendIdx * 2 + 1],
      middleIndex: trendIdx,
      middleOriginId: trendIdx * 2,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      highest: base + range,
      lowest: base,
      leftIds: [trendIdx * 2],
      middleIds: [trendIdx * 2 + 1],
      rightIds: [trendIdx * 2 + 2],
      middleIndex: trendIdx + 1,
      middleOriginId: trendIdx * 2 + 1,
    },
  } as BiVo;
}

function makeChannel(
  offset: number,
  bases: number[],
  trend: TrendDirection,
  status: ChannelStatus,
): ChannelVo {
  const bis = bases.map((base, index) => makeBi(offset + index, base, 20));
  const highs = bis.map((bi) => bi.highest);
  const lows = bis.map((bi) => bi.lowest);

  return {
    bis,
    zg: Math.min(...highs),
    zd: Math.max(...lows),
    gg: Math.max(...highs),
    dd: Math.min(...lows),
    level: ChannelLevel.Bi,
    type: ChannelType.Complete,
    status,
    startId: bis[0].originIds[0],
    endId: bis[bis.length - 1].originIds.at(-1)!,
    trend,
    displayStartId: bis[0].originIds[0],
    displayEndId: bis[bis.length - 1].originIds.at(-1)!,
  };
}

function mergeChannels(service: ChannelService, channels: ChannelVo[]) {
  return (
    service as unknown as {
      mergeChannels(value: readonly ChannelVo[]): ChannelVo[];
    }
  ).mergeChannels(channels);
}

describe('ChannelService', () => {
  let service: ChannelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelService],
    }).compile();

    service = module.get<ChannelService>(ChannelService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns a two-phase result object with phaseA and phaseB arrays', () => {
    const result = service.createChannel({
      bi: [makeBi(0, 100), makeBi(1, 100), makeBi(2, 100), makeBi(3, 100)],
    });

    // 两阶段契约：{ phaseA, phaseB }，都是数组
    expect(result).toHaveProperty('phaseA');
    expect(result).toHaveProperty('phaseB');
    expect(Array.isArray(result.phaseA)).toBe(true);
    expect(Array.isArray(result.phaseB)).toBe(true);
    // 不应再有旧的扁平数组 + offsetIndex 结构
    expect(result).not.toHaveProperty('offsetIndex');
  });

  it('produces no channels when fewer than 5 bis', () => {
    const result = service.createChannel({
      bi: [makeBi(0, 100), makeBi(1, 100), makeBi(2, 100), makeBi(3, 100)],
    });

    expect(result.phaseA).toHaveLength(0);
    expect(result.phaseB).toHaveLength(0);
  });

  describe('Phase A enumeration (5-bi base channel)', () => {
    /**
     * 构造一组 5 笔震荡序列，满足 zg > zd：
     *   up(100-110), down(105-115), up(102-112), down(104-114), up(101-111)
     *   zg = min(highs) = 110, zd = max(lows) = 105 → zg > zd ✓
     *   第4、5笔都与 [zd,zg] 重叠 ✓
     */
    function buildOverlappingFiveBis(): BiVo[] {
      return [
        makeBi(0, 100, 10), // up 100-110
        makeBi(1, 105, 10), // down 105-115
        makeBi(2, 102, 10), // up 102-112
        makeBi(3, 104, 10), // down 104-114
        makeBi(4, 101, 10), // up 101-111
      ];
    }

    it('detects a base channel from 5 overlapping alternating bis', () => {
      const result = service.createChannel({ bi: buildOverlappingFiveBis() });

      // Phase A 至少枚举出 1 个基础中枢
      expect(result.phaseA.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseA[0];
      expect(channel.zg).toBeGreaterThan(channel.zd);
      expect(channel.gg).toBeGreaterThanOrEqual(channel.zg);
      expect(channel.dd).toBeLessThanOrEqual(channel.zd);
      // 基础中枢包含至少 5 笔
      expect(channel.bis.length).toBeGreaterThanOrEqual(5);
    });

    it('stamps each detected base channel as Valid (zg>zd suffices)', () => {
      const result = service.createChannel({ bi: buildOverlappingFiveBis() });

      // 标准缠论：zg>zd + ≥3 笔即有效，无过严的极值/范围校验
      expect(result.phaseA[0].status).toBe(ChannelStatus.Valid);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
    });

    it('stamps a detected channel that passes range and extreme rules as Valid', () => {
      const valid = [100, 101, 102, 103, 104].map((base, index) =>
        makeBi(index, base, 20),
      );

      const result = service.createChannel({ bi: valid });

      expect(result.phaseA[0].status).toBe(ChannelStatus.Valid);
      expect(result.phaseB).toHaveLength(1);
    });

    it('keeps a valid five-bi candidate when a later bi breaks alternation', () => {
      const valid = [100, 101, 102, 103, 104].map((base, index) =>
        makeBi(index, base, 20),
      );
      const unrelatedLaterBi = makeBi(6, 200, 20);

      const result = service.createChannel({
        bi: [...valid, unrelatedLaterBi],
      });

      expect(result.phaseA).toHaveLength(1);
      expect(result.phaseA[0].status).toBe(ChannelStatus.Valid);
      expect(result.phaseB).toHaveLength(1);
    });

    it('keeps Phase A candidates isolated to their five-bi base window', () => {
      const extendable = [100, 101, 102, 103, 104, 105, 106].map(
        (base, index) => makeBi(index, base, 20),
      );

      const result = service.createChannel({ bi: extendable });

      expect(result.phaseA[0].bis).toHaveLength(5);
      expect(result.phaseA[0].endId).toBe(extendable[4].originIds.at(-1));
    });

    it('produces no channel when bis do not overlap (zg <= zd)', () => {
      // 5 笔单调上升、无重叠区间：每笔的 lowest 都高于前一笔的 highest
      const noOverlap: BiVo[] = [];
      for (let i = 0; i < 5; i++) {
        // 从 100 起，每笔区间 [base, base+5]，相邻笔不重叠
        const base = 100 + i * 10 + (i % 2) * 5;
        noOverlap.push(makeBi(i, base, 5));
      }
      const result = service.createChannel({ bi: noOverlap });

      expect(result.phaseA).toHaveLength(0);
      expect(result.phaseB).toHaveLength(0);
    });
  });

  describe('Phase B merge (mirror bi mergeBiSegments)', () => {
    /**
     * Phase B 只消化含 Invalid 中枢的 span。
     * 当所有 phaseA 中枢都是 Valid 时，phaseB 应等于 phaseA（不动点立即到达）。
     */
    it('keeps all valid channels when none are invalid', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const tail = makeChannel(
        4,
        [104, 105, 106, 107, 108],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );

      expect(mergeChannels(service, [head, tail])).toEqual([head, tail]);
    });

    it('reduces an overlapping valid-invalid-valid span to one valid channel', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const middle = makeChannel(
        2,
        [102, 103, 104, 105, 106],
        TrendDirection.Down,
        ChannelStatus.Invalid,
      );
      const tail = makeChannel(
        4,
        [104, 105, 106, 107, 108],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );

      const result = mergeChannels(service, [head, middle, tail]);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: ChannelStatus.Valid,
        trend: TrendDirection.Up,
        startId: head.startId,
        endId: tail.endId,
      });
    });

    it('does not merge endpoints with different directions', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const tail = makeChannel(
        2,
        [102, 103, 104, 105, 106],
        TrendDirection.Down,
        ChannelStatus.Invalid,
      );

      expect(mergeChannels(service, [head, tail])).toEqual([head]);
    });

    it('does not merge channels with an incompatible combined zone', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const tail = makeChannel(
        2,
        [300, 301, 302, 303, 304],
        TrendDirection.Up,
        ChannelStatus.Invalid,
      );

      expect(mergeChannels(service, [head, tail])).toEqual([head]);
    });

    it('restarts from the shortest span until it reaches a fixed point', () => {
      const channels = [
        makeChannel(
          0,
          [100, 101, 102, 103, 104],
          TrendDirection.Up,
          ChannelStatus.Valid,
        ),
        makeChannel(
          2,
          [102, 103, 104, 105, 106],
          TrendDirection.Down,
          ChannelStatus.Invalid,
        ),
        makeChannel(
          4,
          [104, 105, 106, 107, 108],
          TrendDirection.Up,
          ChannelStatus.Valid,
        ),
        makeChannel(
          6,
          [106, 107, 108, 109, 110],
          TrendDirection.Down,
          ChannelStatus.Invalid,
        ),
        makeChannel(
          8,
          [108, 109, 110, 111, 112],
          TrendDirection.Up,
          ChannelStatus.Valid,
        ),
      ];

      const result = mergeChannels(service, channels);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        status: ChannelStatus.Valid,
        startId: channels[0].startId,
        endId: channels.at(-1)!.endId,
      });
    });

    it('does not merge separated channels and omits residual Invalid channels', () => {
      const head = makeChannel(
        0,
        [100, 101, 102, 103, 104],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );
      const middle = makeChannel(
        10,
        [102, 103, 104, 105, 106],
        TrendDirection.Down,
        ChannelStatus.Invalid,
      );
      const tail = makeChannel(
        20,
        [104, 105, 106, 107, 108],
        TrendDirection.Up,
        ChannelStatus.Valid,
      );

      expect(mergeChannels(service, [head, middle, tail])).toEqual([
        head,
        tail,
      ]);
    });
  });
});
