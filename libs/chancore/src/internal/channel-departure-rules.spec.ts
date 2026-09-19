/**
 * 缠论走势中枢离开与封存规则矩阵测试集合（Rules 1-4 Departure & Sealing Suite）
 *
 * 覆盖规则矩阵：
 * 1. 规则 1：第 3 类买卖点之后顺势突破极值（3B 破 GG / 3S 破 DD）封存；
 * 2. 规则 2：第 3 类买卖点之后反向第 2 笔/段反穿中枢反向沿（3B 后穿 ZD / 3S 后破 ZG）封存；
 * 3. 规则 3：无第 3 类买卖点，离开后反向单笔/段折返直接打穿中枢反向沿（打穿 ZD / 打穿 ZG）封存；
 * 4. 规则 4：顺势离开后，无论是否形成 3 类买卖点，后续自身已构成独立新中枢核心触发旧中枢封存；
 * 5. 守卫规则：未离开且未扩展的中枢若在震荡中反向击穿反向沿，该候选中枢破坏失效。
 *
 * 支持双向镜像对称（向上 / 向下）与双层级（笔级 Channel / 段级 DuanChannel）全面校验。
 */
import {
  BiStatus,
  BiType,
  ChanBspType,
  ChannelLevel,
  ChannelType,
  DuanStatus,
  DuanType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type {
  ChanBi,
  ChanBspUnit,
  ChanChannel,
  ChanDivergenceZhongshu,
  ChanDuan,
  ChanDuanChannel,
} from '../contracts';
import { BuySellPointDetector } from './buy-sell-point';
import { ChannelCalculator } from './channel';
import { DuanChannelCalculator } from './duan-channel';

function toTestZhongshu(
  channel: ChanChannel | ChanDuanChannel,
): ChanDivergenceZhongshu {
  const units = 'bis' in channel ? channel.bis : channel.duans;
  const first = units[0];
  let last = units[units.length - 1];
  if (channel.type === ChannelType.Complete && !channel.expanded) {
    if (
      'bis' in channel &&
      channel.bis.length >= 5 &&
      channel.bis.length % 2 === 1
    ) {
      last = channel.bis[channel.bis.length - 2];
    } else if (
      'duans' in channel &&
      channel.duans.length >= 4 &&
      channel.duans.length % 2 === 0
    ) {
      last = channel.duans[channel.duans.length - 2];
    }
  }
  return {
    firstUnitTime: first.startTime,
    lastUnitTime: last.endTime,
    zg: channel.zg,
    zd: channel.zd,
    gg: channel.gg,
    dd: channel.dd,
  };
}

// ---------------------------------------------------------------------------
// 辅助构造函数：笔与段
// ---------------------------------------------------------------------------

function makeBi(
  idx: number,
  trend: TrendDirection,
  low: number,
  high: number,
): ChanBi {
  const isUp = trend === TrendDirection.Up;
  return {
    startTime: new Date(2026, 0, idx + 1, 9, 30),
    endTime: new Date(2026, 0, idx + 1, 10, 0),
    high,
    low,
    trend,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 5,
    originIds: [idx * 2, idx * 2 + 1],
    originData: [],
    startFenxing: {
      type: isUp ? FenxingType.Bottom : FenxingType.Top,
      high,
      low,
      leftIds: [idx * 2 - 1],
      middleIds: [idx * 2],
      rightIds: [idx * 2 + 1],
      middleIndex: idx,
      middleOriginId: idx * 2,
    },
    endFenxing: {
      type: isUp ? FenxingType.Top : FenxingType.Bottom,
      high,
      low,
      leftIds: [idx * 2],
      middleIds: [idx * 2 + 1],
      rightIds: [idx * 2 + 2],
      middleIndex: idx + 1,
      middleOriginId: idx * 2 + 1,
    },
  } as ChanBi;
}

function makeDuan(
  idx: number,
  trend: TrendDirection,
  low: number,
  high: number,
): ChanDuan {
  const b = makeBi(idx, trend, low, high);
  return {
    ...b,
    level: ChannelLevel.Duan,
    type: DuanType.Complete,
    status: DuanStatus.Valid,
    bis: [b],
  } as unknown as ChanDuan;
}

describe('中枢离开与封存规则完备测试集合 (Channel Departure Rules 1-4 Suite)', () => {
  const biService = new ChannelCalculator();
  const duanService = new DuanChannelCalculator();

  // -------------------------------------------------------------------------
  // 1. 规则 1 测试：3买/3卖 顺势突破极值封存
  // -------------------------------------------------------------------------
  describe('【规则 1】3买/3卖 顺势突破极值封存 (Rule 1: Breakout After 3B/3S)', () => {
    it('向上笔中枢：离开突破 GG → 形成 3B(low > ZG) → 顺势冲破 GG → 触发规则 1 封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140], GG=150, DD=100
        makeBi(4, TrendDirection.Up, 115, 160), // 顺势突破 GG=150 (达到 160)
        makeBi(5, TrendDirection.Down, 145, 160), // 回踩 145 > ZG(140) 成立 3B
        makeBi(6, TrendDirection.Up, 145, 170), // 顺势突破 GG(160) 达到 170 触发规则 1
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.bis).toHaveLength(5); // 离开笔包含在 b4
      expect(c.gg).toBe(150);
      expect(c.zg).toBe(140);
      expect(c.zd).toBe(120);
    });

    it('向下笔中枢：离开跌破 DD → 形成 3S(high < ZD) → 顺势跌破 DD → 触发规则 1 封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 [160, 180], GG=200, DD=150
        makeBi(4, TrendDirection.Down, 140, 185), // 顺势跌破 DD=150 (达到 140)
        makeBi(5, TrendDirection.Up, 140, 155), // 回抽 155 < ZD(160) 成立 3S
        makeBi(6, TrendDirection.Down, 130, 155), // 顺势跌破 DD(140) 达到 130 触发规则 1
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.bis).toHaveLength(5);
      expect(c.dd).toBe(150);
      expect(c.zg).toBe(180);
      expect(c.zd).toBe(160);
    });

    it('向上段中枢：离开突破 GG → 形成 3B(low > ZG) → 顺势冲破 GG → 触发规则 1 封存', () => {
      const duans: ChanDuan[] = [
        makeDuan(0, TrendDirection.Up, 100, 150),
        makeDuan(1, TrendDirection.Down, 120, 150),
        makeDuan(2, TrendDirection.Up, 120, 140), // 初始核心 3 段 [120, 140]
        makeDuan(3, TrendDirection.Down, 125, 140), // 内部回拉
        makeDuan(4, TrendDirection.Up, 125, 160), // 离开突破 GG=150
        makeDuan(5, TrendDirection.Down, 145, 160), // 3B 回抽
        makeDuan(6, TrendDirection.Up, 145, 170), // 顺势突破 GG=160
      ];

      const result = duanService.createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      expect(result.phaseB[0].gg).toBe(160);
    });
  });

  // -------------------------------------------------------------------------
  // 2. 规则 2 测试：3买/3卖 后反向第 2 笔打穿反向沿封存
  // -------------------------------------------------------------------------
  describe('【规则 2】3买/3卖 后反向第 2 笔击穿反向沿封存 (Rule 2: Opposite Pierce After 3B/3S)', () => {
    it('向上笔中枢：离开突破 GG → 形成 3B → 冲高未果 → 反向第 2 笔击穿 ZD 封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140], GG=150
        makeBi(4, TrendDirection.Up, 115, 160), // 突破 GG 达到 160
        makeBi(5, TrendDirection.Down, 142, 160), // 回抽 142 > ZG(140) 成立 3B
        makeBi(6, TrendDirection.Up, 142, 155), // 冲高 155 未破 GG 160
        makeBi(7, TrendDirection.Down, 110, 155), // 反向第 2 笔跌到 110，击穿 ZD(120) 触发规则 2
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      expect(result.phaseB[0].bis).toHaveLength(5);
      expect(result.phaseB[0].gg).toBe(150);
    });

    it('向下笔中枢：离开跌破 DD → 形成 3S → 下探未果 → 反向第 2 笔冲破 ZG 封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 [160, 180], DD=150
        makeBi(4, TrendDirection.Down, 140, 185), // 跌破 DD 达到 140
        makeBi(5, TrendDirection.Up, 140, 158), // 回抽 158 < ZD(160) 成立 3S
        makeBi(6, TrendDirection.Down, 145, 158), // 下探 145 未破 DD 140
        makeBi(7, TrendDirection.Up, 145, 190), // 反向第 2 笔冲到 190，冲破 ZG(180) 触发规则 2
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      expect(result.phaseB[0].bis).toHaveLength(5);
      expect(result.phaseB[0].dd).toBe(150);
    });
  });

  // -------------------------------------------------------------------------
  // 3. 规则 3 测试：无 3买/3卖，离开后单笔反向直接打穿反向沿封存
  // -------------------------------------------------------------------------
  describe('【规则 3】无 3买/3卖，离开后单笔反向直接打穿反向沿封存 (Rule 3: Direct Reverse Pierce Without 3B/3S)', () => {
    it('向上笔中枢：突破离开后直接反向单笔暴跌击穿 ZD → 触发规则 3 封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140]
        makeBi(4, TrendDirection.Up, 115, 160), // 突破离开到 160
        makeBi(5, TrendDirection.Down, 95, 160), // 反向单笔直接暴跌至 95 < DD(100)，无 3B，触发规则 3 封存
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.bis).toHaveLength(5);
      expect(c.gg).toBe(150);
      expect(c.zg).toBe(140);
      expect(c.zd).toBe(120);
    });

    it('向下笔中枢：跌破离开后直接反向单笔暴力反弹冲破 ZG → 触发规则 3 封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 [160, 180]
        makeBi(4, TrendDirection.Down, 140, 185), // 跌破离开到 140
        makeBi(5, TrendDirection.Up, 140, 205), // 反向单笔直接暴力拉升至 205 > GG(200)，无 3S，触发规则 3 封存
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.bis).toHaveLength(5);
      expect(c.dd).toBe(150);
      expect(c.zg).toBe(180);
      expect(c.zd).toBe(160);
    });
  });

  // -------------------------------------------------------------------------
  // 4. 规则 4 测试：突破离开后，后续自身独立构成新中枢核心封存
  // -------------------------------------------------------------------------
  describe('【规则 4】顺势离开后，后续走势独立构成新中枢核心触发封存 (Rule 4: New Core Emergence)', () => {
    it('向上笔中枢：突破离开后，后续 4 笔独立构成新中枢核心，旧中枢在离开端点立即封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 1 [120, 140]
        makeBi(4, TrendDirection.Up, 115, 160), // 突破离开到 160 (触发新核心探测)
        // 从 b4 开始后续 4 笔 [b4, b5, b6, b7] 自身构成向上新中枢核心：
        makeBi(5, TrendDirection.Down, 152, 160),
        makeBi(6, TrendDirection.Up, 152, 158),
        makeBi(7, TrendDirection.Down, 148, 158), // 新核心 [152, 158] (ZG=158 > ZD=152)
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const c1 = result.phaseB[0];
      // 旧中枢在 b4 顺利封存为 5 笔，离开冲高至 160，中枢内部 GG 为 150
      expect(c1.bis).toHaveLength(5);
      expect(c1.gg).toBe(150);
      expect(c1.zg).toBe(140);
      expect(c1.zd).toBe(120);
    });

    it('向下笔中枢：跌破离开后，后续 4 笔独立构成新中枢核心，旧中枢在离开端点立即封存', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 1 [160, 180]
        makeBi(4, TrendDirection.Down, 140, 185), // 跌破离开到 140
        // 从 b4 开始后续 4 笔 [b4, b5, b6, b7] 自身构成向下新中枢核心：
        makeBi(5, TrendDirection.Up, 140, 148),
        makeBi(6, TrendDirection.Down, 142, 148),
        makeBi(7, TrendDirection.Up, 142, 152), // 新核心 [142, 148] (ZG=148 > ZD=142)
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const c1 = result.phaseB[0];
      expect(c1.bis).toHaveLength(5);
      expect(c1.dd).toBe(150);
      expect(c1.zg).toBe(180);
      expect(c1.zd).toBe(160);
    });
  });

  // -------------------------------------------------------------------------
  // 5. 守卫规则：未离开反向崩塌守卫
  // -------------------------------------------------------------------------
  describe('【守卫规则】未离开反向崩塌守卫 (Opposite Pierce Guard)', () => {
    it('向上走势未曾离开，随后反向跌穿 ZD → 候选中枢失效作废，杜绝伪中枢输出', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140]
        makeBi(4, TrendDirection.Up, 115, 135), // 仍在内部震荡，未曾突破 ZG(140) 或 GG(150)
        makeBi(5, TrendDirection.Down, 90, 135), // 暴跌至 90，直接砸穿 ZD(120) 与 DD(100)
      ];

      const result = biService.createChannels(bis);
      // 未离开便反向崩塌，向上候选中枢失效作废，杜绝输出包含 b0 的向上中枢
      expect(result.phaseB.some((c) => c.trend === TrendDirection.Up)).toBe(
        false,
      );
    });

    it('向下走势未曾离开，随后反向冲破 ZG → 候选中枢失效作废，杜绝伪中枢输出', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 [160, 180]
        makeBi(4, TrendDirection.Down, 165, 185), // 仍在内部震荡，未曾跌破 ZD(160) 或 DD(150)
        makeBi(5, TrendDirection.Up, 165, 210), // 暴拉至 210，直接冲破 ZG(180) 与 GG(200)
      ];

      const result = biService.createChannels(bis);
      // 未离开便反向崩塌，向下候选中枢失效作废，杜绝输出包含 b0 的向下中枢
      expect(result.phaseB.some((c) => c.trend === TrendDirection.Down)).toBe(
        false,
      );
    });

    it('向上走势核心形成后，后续震荡笔跌破进入笔起点(low < firstBi.low) → 严禁吸纳为中枢延伸，候选中枢失效作废', () => {
      // 模拟实盘第6中枢形态：b0(120->145), b1(145->125), b2(125->160), b3(160->125)
      // 核心构件 ZG=145, ZD=125, DD=125 >= b0.low(120) 合法；
      // 但随后 b4(125->145), b5(145->100) 暴跌跌破 b0.low(120)；
      // 严禁将 b4/b5 吸收为中枢延伸，杜绝 DD < b0.low
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 120, 145),
        makeBi(1, TrendDirection.Down, 125, 145),
        makeBi(2, TrendDirection.Up, 125, 160),
        makeBi(3, TrendDirection.Down, 125, 160),
        makeBi(4, TrendDirection.Up, 125, 145),
        makeBi(5, TrendDirection.Down, 100, 145), // 暴跌至 100，打穿 b0.low(120)
        makeBi(6, TrendDirection.Up, 100, 150),
        makeBi(7, TrendDirection.Down, 130, 150),
        makeBi(8, TrendDirection.Up, 130, 155),
        makeBi(9, TrendDirection.Down, 130, 155),
      ];

      const result = biService.createChannels(bis);
      // 包含 b0 的向上候选中枢必须失效作废，绝不能产出 DD(100) < b0.low(120) 的中枢
      const invalidCentral = result.phaseB.find(
        (c) => c.trend === TrendDirection.Up && c.bis[0].low === 120,
      );
      expect(invalidCentral).toBeUndefined();
      // 所有输出的上涨中枢 DD 必须 >= 起笔 b0.low
      for (const c of result.phaseB) {
        if (c.trend === TrendDirection.Up) {
          expect(c.dd).toBeGreaterThanOrEqual(c.bis[0].low);
        }
      }
    });

    it('向下走势核心形成后，后续震荡笔突破进入笔起点(high > firstBi.high) → 严禁吸纳为中枢延伸，候选中枢失效作废', () => {
      // 严格对偶：下跌中枢起笔高点 200，随后反弹冲破 200，严禁吸纳为延伸，杜绝 GG > b0.high
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 155, 200),
        makeBi(1, TrendDirection.Up, 155, 175),
        makeBi(2, TrendDirection.Down, 140, 175),
        makeBi(3, TrendDirection.Up, 140, 175),
        makeBi(4, TrendDirection.Down, 155, 175),
        makeBi(5, TrendDirection.Up, 155, 220), // 暴涨至 220，冲破 b0.high(200)
        makeBi(6, TrendDirection.Down, 160, 220),
        makeBi(7, TrendDirection.Up, 160, 190),
        makeBi(8, TrendDirection.Down, 150, 190),
        makeBi(9, TrendDirection.Up, 150, 185),
      ];

      const result = biService.createChannels(bis);
      const invalidCentral = result.phaseB.find(
        (c) => c.trend === TrendDirection.Down && c.bis[0].high === 200,
      );
      expect(invalidCentral).toBeUndefined();
      for (const c of result.phaseB) {
        if (c.trend === TrendDirection.Down) {
          expect(c.gg).toBeLessThanOrEqual(c.bis[0].high);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5.1 离开笔第一公理：无 3 买则必破 GG / 无 3 卖则必破 DD
  // -------------------------------------------------------------------------
  describe('【离开笔第一公理】离开笔除非是出现了3买/3卖，否则离开笔极值必须突破GG/DD (Axiom: Break GG/DD Unless 3B/3S)', () => {
    it('向上笔中枢：第 5 笔突破 ZG(140) 达到 145 < GG(150)，随后回抽跌回 130 < ZG(140) 无 3B → 绝不能封存为 Complete 离开笔', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140], GG=150
        makeBi(4, TrendDirection.Up, 115, 145), // 冲破 ZG(140) 但未破 GG(150)
        makeBi(5, TrendDirection.Down, 130, 145), // 回踩 130 < ZG(140)，无 3B
        makeBi(6, TrendDirection.Up, 130, 138),
      ];

      const result = biService.createChannels(bis);
      // b4 绝不能作为 5 笔 Complete 离开笔封存输出
      const sealedAtB4 = result.phaseB.find(
        (c) => c.type === ChannelType.Complete && c.bis.length === 5,
      );
      expect(sealedAtB4).toBeUndefined();
    });

    it('向下笔中枢：第 5 笔跌破 ZD(160) 达到 155 > DD(150)，随后反抽 170 > ZD(160) 无 3S → 绝不能封存为 Complete 离开笔', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 [160, 180], DD=150
        makeBi(4, TrendDirection.Down, 155, 185), // 跌破 ZD(160) 但未破 DD(150)
        makeBi(5, TrendDirection.Up, 155, 170), // 反抽 170 > ZD(160)，无 3S
        makeBi(6, TrendDirection.Down, 162, 170),
      ];

      const result = biService.createChannels(bis);
      const sealedAtB4 = result.phaseB.find(
        (c) => c.type === ChannelType.Complete && c.bis.length === 5,
      );
      expect(sealedAtB4).toBeUndefined();
    });

    it('向上笔中枢：第 5 笔未破 GG(150)，随后的反向笔暴跌击穿 ZD(120) 且后续确认跌破起点（日线下跌笔确立）→ 严禁吸纳为中枢延伸，绝不跨入日线下跌笔', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140], GG=150
        makeBi(4, TrendDirection.Up, 115, 145), // 冲高 145 < GG(150)
        makeBi(5, TrendDirection.Down, 110, 145), // 暴跌至 110，击穿 ZD(120)
        makeBi(6, TrendDirection.Up, 110, 125),
        makeBi(7, TrendDirection.Down, 90, 125), // 跌穿起点 100
      ];

      const result = biService.createChannels(bis);
      // 绝不能产出包含 b5 且将 b4/b5 错误吸纳的向上中枢
      expect(
        result.phaseB.some(
          (c) =>
            c.trend === TrendDirection.Up && c.bis.some((b) => b.low === 110),
        ),
      ).toBe(false);
    });

    it('封闭切片末端（allowUncomplete: false）：末笔虽破 ZG 但未破 GG，且无 3B → 严禁草率封存为 Complete 离开笔', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140),
        makeBi(4, TrendDirection.Up, 115, 145), // 末笔 145 > ZG(140)，但 145 < GG(150)，且序列结束无 pullback
      ];

      const result = biService.createChannels(bis, { allowUncomplete: false });
      // 封闭切片末端未突破 GG 且无 3B，绝不能封存为 Complete 离开笔
      expect(
        result.phaseB.some(
          (c) => c.type === ChannelType.Complete && c.bis.length === 5,
        ),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 6. 未完成中枢与实时买卖点测试：末端中枢 UnComplete 标识与 3B/3S 实时求值
  // -------------------------------------------------------------------------
  describe('【未完成中枢】末端未离开中枢赋予 UnComplete 标识并实时参与三类买卖点计算', () => {
    const bspDetector = new BuySellPointDetector();

    it('序列末端 4 笔基础核心：赋予 ChannelType.UnComplete 标识', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140]
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.type).toBe(ChannelType.UnComplete);
      expect(c.bis).toHaveLength(4);
      expect(c.zg).toBe(140);
      expect(c.zd).toBe(120);
      expect(c.gg).toBe(150);
      expect(c.dd).toBe(115);
    });

    it('向上走势突破离开后回踩 3B 形成当下：中枢封存为 Complete，实时产出 ThirdBuy', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140), // 核心 [120, 140]
        makeBi(4, TrendDirection.Up, 115, 160), // 顺势突破离开至 160
        makeBi(5, TrendDirection.Down, 145, 160), // 回踩 145 > ZG(140) 成立 3B
      ];

      // 1. 中枢计算：3B 确立后中枢封存
      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.type).toBe(ChannelType.Complete);
      expect(c.bis).toHaveLength(5); // 核心构件与离开笔共 5 笔
      expect(c.zg).toBe(140);
      expect(c.zd).toBe(120);

      // 2. 买卖点实时求值：传入已封存中枢
      const units: readonly ChanBspUnit[] = bis.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        high: b.high,
        low: b.low,
        trend: b.trend,
      }));
      const zhongshus: readonly ChanDivergenceZhongshu[] = [toTestZhongshu(c)];
      const points = bspDetector.detectBuySellPoints({
        units,
        zhongshus,
        forces: [],
      });

      const thirdBuys = points.filter((p) => p.type === ChanBspType.ThirdBuy);
      expect(thirdBuys).toHaveLength(1);
      expect(thirdBuys[0]).toMatchObject({
        type: ChanBspType.ThirdBuy,
        unitIndex: 5,
        price: 145,
        zhongshuIndex: 0,
      });
    });

    it('向下走势跌破离开后反抽 3S 形成当下：中枢封存为 Complete，实时产出 ThirdSell', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Down, 150, 200),
        makeBi(1, TrendDirection.Up, 150, 180),
        makeBi(2, TrendDirection.Down, 160, 180),
        makeBi(3, TrendDirection.Up, 160, 185), // 核心 [160, 180]
        makeBi(4, TrendDirection.Down, 140, 185), // 顺势跌破离开至 140
        makeBi(5, TrendDirection.Up, 140, 155), // 反抽 155 < ZD(160) 成立 3S
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.type).toBe(ChannelType.Complete);
      expect(c.bis).toHaveLength(5);
      expect(c.zg).toBe(180);
      expect(c.zd).toBe(160);

      const units: readonly ChanBspUnit[] = bis.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        high: b.high,
        low: b.low,
        trend: b.trend,
      }));
      const zhongshus: readonly ChanDivergenceZhongshu[] = [toTestZhongshu(c)];
      const points = bspDetector.detectBuySellPoints({
        units,
        zhongshus,
        forces: [],
      });

      const thirdSells = points.filter((p) => p.type === ChanBspType.ThirdSell);
      expect(thirdSells).toHaveLength(1);
      expect(thirdSells[0]).toMatchObject({
        type: ChanBspType.ThirdSell,
        unitIndex: 5,
        price: 155,
        zhongshuIndex: 0,
      });
    });

    it('后续冲破 GG 达成规则 1 封存后：中枢状态平滑迁移至 Complete，且 3B 依然稳定识别', () => {
      const bis: ChanBi[] = [
        makeBi(0, TrendDirection.Up, 100, 150),
        makeBi(1, TrendDirection.Down, 120, 150),
        makeBi(2, TrendDirection.Up, 120, 140),
        makeBi(3, TrendDirection.Down, 115, 140),
        makeBi(4, TrendDirection.Up, 115, 160),
        makeBi(5, TrendDirection.Down, 145, 160), // 3B
        makeBi(6, TrendDirection.Up, 145, 170), // 冲破 GG(160) 触发规则 1 封存
      ];

      const result = biService.createChannels(bis);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.type).toBe(ChannelType.Complete);
      expect(c.bis).toHaveLength(5); // 已封存包含离开笔 b4

      const units: readonly ChanBspUnit[] = bis.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        high: b.high,
        low: b.low,
        trend: b.trend,
      }));
      const zhongshus: readonly ChanDivergenceZhongshu[] = [toTestZhongshu(c)];
      const points = bspDetector.detectBuySellPoints({
        units,
        zhongshus,
        forces: [],
      });

      const thirdBuys = points.filter((p) => p.type === ChanBspType.ThirdBuy);
      expect(thirdBuys).toHaveLength(1);
      expect(thirdBuys[0].unitIndex).toBe(5);
    });

    it('段级别末端 3 段基础核心：赋予 ChannelType.UnComplete 标识', () => {
      const duans: ChanDuan[] = [
        makeDuan(0, TrendDirection.Up, 100, 150),
        makeDuan(1, TrendDirection.Down, 120, 150),
        makeDuan(2, TrendDirection.Up, 120, 140),
      ];

      const result = duanService.createDuanChannels(duans);
      expect(result.phaseB).toHaveLength(1);
      const c = result.phaseB[0];
      expect(c.type).toBe(ChannelType.UnComplete);
      expect(c.duans).toHaveLength(3);
      expect(c.zg).toBe(140);
      expect(c.zd).toBe(120);
    });
  });
});
