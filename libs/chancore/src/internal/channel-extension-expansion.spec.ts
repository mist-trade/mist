import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  FenxingType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanChannel } from '../contracts';
import { ChannelCalculator } from './channel';

/**
 * 构造用于测试的单笔对象
 */
function makeTestBi(
  idx: number,
  trend: TrendDirection,
  low: number,
  high: number,
): ChanBi {
  const isUp = trend === TrendDirection.Up;
  return {
    startTime: new Date(2024, 0, idx + 1, 9, 30),
    endTime: new Date(2024, 0, idx + 1, 10, 0),
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

/**
 * 辅助生成一个基础测试中枢
 */
function makeMockChannel(params: {
  bis: ChanBi[];
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  trend: TrendDirection;
  type?: ChannelType;
  extended?: boolean;
  expanded?: boolean;
}): ChanChannel {
  const firstBi = params.bis[0];
  const lastBi = params.bis[params.bis.length - 1];
  return {
    bis: params.bis,
    zg: params.zg,
    zd: params.zd,
    gg: params.gg,
    dd: params.dd,
    level: ChannelLevel.Bi,
    type: params.type ?? ChannelType.Complete,
    status: ChannelStatus.Valid,
    startId: firstBi.originIds[0],
    endId: lastBi.originIds[lastBi.originIds.length - 1],
    displayStartId: firstBi.originIds[0],
    displayEndId: lastBi.originIds[lastBi.originIds.length - 1],
    trend: params.trend,
    extended: params.extended ?? false,
    expanded: params.expanded ?? false,
  };
}

describe('ChannelCalculator - Central Extension & Expansion (笔中枢延伸与扩展)', () => {
  let calculator: ChannelCalculator;

  beforeEach(() => {
    calculator = new ChannelCalculator();
  });

  describe('中枢延伸（Central Extension）', () => {
    it('两相邻同向上涨中枢满足共用连接笔且 [ZD, ZG] 存在交集，合并替换为单一大中枢', () => {
      // 构造两组笔，其中 b4 是 c1 的最后一笔（离开笔），也是 c2 的第一笔（进入笔）
      // c1 向上中枢 (b0~b4)
      const b0 = makeTestBi(0, TrendDirection.Up, 10, 30);
      const b1 = makeTestBi(1, TrendDirection.Down, 18, 28);
      const b2 = makeTestBi(2, TrendDirection.Up, 20, 32);
      const b3 = makeTestBi(3, TrendDirection.Down, 19, 29);
      const b4 = makeTestBi(4, TrendDirection.Up, 22, 38); // 连接笔

      // c2 向上中枢 (b4~b8)
      const b5 = makeTestBi(5, TrendDirection.Down, 23, 35);
      const b6 = makeTestBi(6, TrendDirection.Up, 24, 37);
      const b7 = makeTestBi(7, TrendDirection.Down, 22, 34);
      const b8 = makeTestBi(8, TrendDirection.Up, 26, 45); // c2 离开笔

      // c1: zg=28, zd=20, gg=38, dd=10
      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 28,
        zd: 20,
        gg: 38,
        dd: 10,
        trend: TrendDirection.Up,
      });

      // c2: zg=34, zd=24, gg=45, dd=22 (ZD/ZG 交集为 [24, 28])
      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 34,
        zd: 24,
        gg: 45,
        dd: 22,
        trend: TrendDirection.Up,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);

      // 延伸结果：原两中枢被合并替换为 1 个新中枢
      expect(result.length).toBe(1);
      const extended = result[0];

      // 构件笔去重连接笔后共 9 笔
      expect(extended.bis.length).toBe(9);
      expect(extended.bis[0]).toBe(b0);
      expect(extended.bis[8]).toBe(b8);

      // 全量笔极值
      expect(extended.gg).toBe(45);
      expect(extended.dd).toBe(10);

      // 内部笔 slice(1, -1) 为 b1~b7
      // 内部笔 highs: [28, 32, 29, 38, 35, 37, 34]，min(high) = 28
      // 内部笔 lows:  [18, 20, 19, 22, 23, 24, 22]，max(low) = 24
      // 内部笔全量交集存在且 min(high) > max(low)：zg=28, zd=24
      expect(extended.zg).toBe(28);
      expect(extended.zd).toBe(24);

      // 明确标记 extended = true，expanded = false
      expect(extended.extended).toBe(true);
      expect(extended.expanded).toBe(false);
      expect(extended.type).toBe(ChannelType.Complete);
    });

    it('延伸时若内部构件笔未贯穿全量交集（局部倒挂），保底回退取两中枢原区间交集', () => {
      const b0 = makeTestBi(0, TrendDirection.Up, 10, 30);
      const b1 = makeTestBi(1, TrendDirection.Down, 21, 28);
      const b2 = makeTestBi(2, TrendDirection.Up, 22, 29);
      const b4 = makeTestBi(4, TrendDirection.Up, 22, 38); // 连接笔

      // 在 c2 内部人为构造一笔波动较深的笔 b6 (low=26, high=36)，若使得 min(high) < max(low) 则触发保底
      const b5 = makeTestBi(5, TrendDirection.Down, 24, 35);
      const b6 = makeTestBi(6, TrendDirection.Up, 26, 36);
      const b7 = makeTestBi(7, TrendDirection.Down, 25, 34);
      const b8 = makeTestBi(8, TrendDirection.Up, 27, 45);

      // c1 的 [25, 27] 与 c2 的 [26, 28] 存在交集 [26, 27]
      // 内部笔 slice(1,-1) 为 b1~b7，其中 b3LowHigh 的 high 仅为 24，使得 min(high)=24 < max(low)=26，倒挂触发保底！
      const b3LowHigh = makeTestBi(3, TrendDirection.Down, 20, 24);
      const c1Modified = makeMockChannel({
        bis: [b0, b1, b2, b3LowHigh, b4],
        zg: 27,
        zd: 25,
        gg: 38,
        dd: 10,
        trend: TrendDirection.Up,
      });
      const c2Modified = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 28,
        zd: 26,
        gg: 45,
        dd: 22,
        trend: TrendDirection.Up,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([
        c1Modified,
        c2Modified,
      ]);
      expect(result.length).toBe(1);

      // 触发保底：zg = min(27, 28) = 27; zd = max(25, 26) = 26
      expect(result[0].zg).toBe(27);
      expect(result[0].zd).toBe(26);
    });

    it('支持连续 3 个同向中枢的贪婪链式延伸融合（A + B + C -> ABC）', () => {
      const b0 = makeTestBi(0, TrendDirection.Up, 10, 30);
      const b1 = makeTestBi(1, TrendDirection.Down, 20, 28);
      const b2 = makeTestBi(2, TrendDirection.Up, 21, 29);
      const b3 = makeTestBi(3, TrendDirection.Down, 20, 28);
      const b4 = makeTestBi(4, TrendDirection.Up, 22, 35); // A的离开笔，B的进入笔

      const b5 = makeTestBi(5, TrendDirection.Down, 21, 30);
      const b6 = makeTestBi(6, TrendDirection.Up, 22, 31);
      const b7 = makeTestBi(7, TrendDirection.Down, 21, 30);
      const b8 = makeTestBi(8, TrendDirection.Up, 23, 38); // B的离开笔，C的进入笔

      const b9 = makeTestBi(9, TrendDirection.Down, 22, 32);
      const b10 = makeTestBi(10, TrendDirection.Up, 23, 33);
      const b11 = makeTestBi(11, TrendDirection.Down, 22, 32);
      const b12 = makeTestBi(12, TrendDirection.Up, 25, 42); // C的离开笔

      const cA = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 28,
        zd: 21,
        gg: 35,
        dd: 10,
        trend: TrendDirection.Up,
      });

      const cB = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 30,
        zd: 22,
        gg: 38,
        dd: 21,
        trend: TrendDirection.Up,
      });

      const cC = makeMockChannel({
        bis: [b8, b9, b10, b11, b12],
        zg: 32,
        zd: 23,
        gg: 42,
        dd: 22,
        trend: TrendDirection.Up,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([
        cA,
        cB,
        cC,
      ]);

      // A、B、C 贪婪融合成 1 个超大延伸中枢
      expect(result.length).toBe(1);
      const merged = result[0];
      // 5 + 4 + 4 = 13 笔
      expect(merged.bis.length).toBe(13);
      expect(merged.gg).toBe(42);
      expect(merged.dd).toBe(10);
      expect(merged.extended).toBe(true);
      expect(merged.expanded).toBe(false);
    });
  });

  describe('中枢扩展（Central Expansion）', () => {
    it('两相邻同向下跌中枢 [ZD, ZG] 无交集但 [DD, GG] 有交集，双层叠加保留原中枢并追加外层大框', () => {
      // 下跌中枢 c1
      const b0 = makeTestBi(0, TrendDirection.Down, 80, 100);
      const b1 = makeTestBi(1, TrendDirection.Up, 85, 95);
      const b2 = makeTestBi(2, TrendDirection.Down, 83, 93);
      const b3 = makeTestBi(3, TrendDirection.Up, 86, 96);
      const b4 = makeTestBi(4, TrendDirection.Down, 65, 90); // 连接笔

      // 下跌中枢 c2（整体台阶下移）
      const b5 = makeTestBi(5, TrendDirection.Up, 68, 78);
      const b6 = makeTestBi(6, TrendDirection.Down, 66, 76);
      const b7 = makeTestBi(7, TrendDirection.Up, 69, 79);
      const b8 = makeTestBi(8, TrendDirection.Down, 50, 75); // c2 离开笔

      // c1: zg=93, zd=86, gg=100, dd=65
      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        trend: TrendDirection.Down,
      });

      // c2: zg=76, zd=69, gg=79, dd=50
      // 核心区间：c1 [86, 93], c2 [69, 76]，max(zd)=86 > min(zg)=76，无核心交集！
      // 极值区间：c1 [65, 100], c2 [50, 79]，max(dd)=65 < min(gg)=79，存在极值交集 [65, 79]！
      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 76,
        zd: 69,
        gg: 79,
        dd: 50,
        trend: TrendDirection.Down,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);

      // 双层叠加保留：输出 [c1, expandedBox, c2]
      expect(result.length).toBe(3);

      // 第 1 个是保留的 c1（小框，非扩展大框）
      expect(result[0]).toBe(c1);
      expect(result[0].expanded).toBe(false);
      expect(result[0].extended).toBe(false);

      // 第 2 个是外层扩展大框
      const expandedBox = result[1];
      expect(expandedBox.expanded).toBe(true);
      expect(expandedBox.extended).toBe(false);
      // 包裹两中枢核心区间：ZG = max(93, 76) = 93; ZD = min(86, 69) = 69
      expect(expandedBox.zg).toBe(93);
      expect(expandedBox.zd).toBe(69);
      // 极值：GG = max(100, 79) = 100; DD = min(65, 50) = 50
      expect(expandedBox.gg).toBe(100);
      expect(expandedBox.dd).toBe(50);
      expect(expandedBox.bis.length).toBe(9);
      expect(expandedBox.bis[0]).toBe(b0);
      expect(expandedBox.bis[8]).toBe(b8);

      // 第 3 个是保留的 c2（小框，非扩展大框）
      expect(result[2]).toBe(c2);
      expect(result[2].expanded).toBe(false);
      expect(result[2].extended).toBe(false);
    });

    it('实盘真实用例：平安银行 (000001) 30分钟图 4月7日前后两中枢扩展区间端到端校验', () => {
      // 模拟 2026年3月26日 ~ 4月15日 平安银行 30M 真实走势构件笔序列
      // c1: 3月26日 ~ 4月3日 震荡形成的中枢
      const b0 = makeTestBi(0, TrendDirection.Down, 3852.09, 3937.1); // 进入笔
      const b1 = makeTestBi(1, TrendDirection.Up, 3852.09, 3924.11);
      const b2 = makeTestBi(2, TrendDirection.Down, 3872.78, 3924.11);
      const b3 = makeTestBi(3, TrendDirection.Up, 3872.78, 3948.81);
      const b4 = makeTestBi(4, TrendDirection.Down, 3891.86, 3948.81);
      const b5 = makeTestBi(5, TrendDirection.Up, 3891.86, 3955.94);
      const b6 = makeTestBi(6, TrendDirection.Down, 3871.3, 3955.94);
      // b7: 4月3日 13:30 ~ 4月8日 15:00 离开第一个中枢拉升突破，同时作为第二个中枢进入笔
      const b7 = makeTestBi(7, TrendDirection.Up, 3871.3, 3995.0); // 核心连接笔

      // c2: 4月8日 ~ 4月13日 震荡形成的高位中枢
      const b8 = makeTestBi(8, TrendDirection.Down, 3955.25, 3995.0);
      const b9 = makeTestBi(9, TrendDirection.Up, 3955.25, 4011.02);
      const b10 = makeTestBi(10, TrendDirection.Down, 3966.2, 4011.02);
      const b11 = makeTestBi(11, TrendDirection.Up, 3966.2, 4050.62); // 离开笔

      // 1. 第一个中枢 c1: [ZD: 3891.86, ZG: 3924.11], DD: 3794.68, GG: 3995.00
      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4, b5, b6, b7],
        zg: 3924.11,
        zd: 3891.86,
        gg: 3995.0,
        dd: 3794.68,
        trend: TrendDirection.Down,
      });

      // 2. 第二个中枢 c2: [ZD: 3966.20, ZG: 3995.00], DD: 3871.30, GG: 4050.62
      const c2 = makeMockChannel({
        bis: [b7, b8, b9, b10, b11],
        zg: 3995.0,
        zd: 3966.2,
        gg: 4050.62,
        dd: 3871.3,
        trend: TrendDirection.Down,
      });

      // 3. 执行中枢延伸与扩展算法
      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);

      // 4. 结构断言：满足两中枢扩展，输出 [c1, expandedBox, c2]，长度严格为 3
      expect(result).toHaveLength(3);

      // (1) 内层左侧小中枢 c1: 保持普通笔中枢，杜绝误标扩展
      expect(result[0]).toBe(c1);
      expect(result[0].expanded).toBe(false);
      expect(result[0].extended).toBe(false);
      expect(result[0].zg).toBe(3924.11);
      expect(result[0].zd).toBe(3891.86);
      expect(result[0].gg).toBe(3995.0);
      expect(result[0].dd).toBe(3794.68);

      // (2) 外层包裹大框 expandedBox: 专属标记 expanded=true，完整包裹两中枢
      const expandedBox = result[1];
      expect(expandedBox.expanded).toBe(true);
      expect(expandedBox.extended).toBe(false);
      // ZG = max(3924.11, 3995.00) = 3995.00
      expect(expandedBox.zg).toBe(3995.0);
      // ZD = min(3891.86, 3966.20) = 3891.86
      expect(expandedBox.zd).toBe(3891.86);
      // GG = max(3995.00, 4050.62) = 4050.62
      expect(expandedBox.gg).toBe(4050.62);
      // DD = min(3794.68, 3871.30) = 3794.68
      expect(expandedBox.dd).toBe(3794.68);
      // 构件笔包含起止两中枢的所有构件 (b0 ~ b11，共 12 笔)
      expect(expandedBox.bis).toHaveLength(12);
      expect(expandedBox.bis[0]).toBe(b0);
      expect(expandedBox.bis[11]).toBe(b11);

      // (3) 内层右侧小中枢 c2: 保持普通笔中枢
      expect(result[2]).toBe(c2);
      expect(result[2].expanded).toBe(false);
      expect(result[2].extended).toBe(false);
      expect(result[2].zg).toBe(3995.0);
      expect(result[2].zd).toBe(3966.2);
      expect(result[2].gg).toBe(4050.62);
      expect(result[2].dd).toBe(3871.3);
    });

    it('连续相邻扩展独立生成外层大框', () => {
      const b0 = makeTestBi(0, TrendDirection.Down, 80, 100);
      const b1 = makeTestBi(1, TrendDirection.Up, 85, 95);
      const b2 = makeTestBi(2, TrendDirection.Down, 83, 93);
      const b3 = makeTestBi(3, TrendDirection.Up, 86, 96);
      const b4 = makeTestBi(4, TrendDirection.Down, 65, 90);

      const b5 = makeTestBi(5, TrendDirection.Up, 68, 78);
      const b6 = makeTestBi(6, TrendDirection.Down, 66, 76);
      const b7 = makeTestBi(7, TrendDirection.Up, 69, 79);
      const b8 = makeTestBi(8, TrendDirection.Down, 45, 75);

      const b9 = makeTestBi(9, TrendDirection.Up, 48, 58);
      const b10 = makeTestBi(10, TrendDirection.Down, 46, 56);
      const b11 = makeTestBi(11, TrendDirection.Up, 49, 59);
      const b12 = makeTestBi(12, TrendDirection.Down, 30, 55);

      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        trend: TrendDirection.Down,
      });

      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 76,
        zd: 69,
        gg: 79,
        dd: 45,
        trend: TrendDirection.Down,
      });

      const c3 = makeMockChannel({
        bis: [b8, b9, b10, b11, b12],
        zg: 56,
        zd: 49,
        gg: 59,
        dd: 30,
        trend: TrendDirection.Down,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([
        c1,
        c2,
        c3,
      ]);

      // c1 与 c2 扩展，c2 与 c3 也扩展
      // 结果结构为: [c1, E(c1,c2), c2, E(c2,c3), c3]
      expect(result.length).toBe(5);
      expect(result[0]).toBe(c1);
      expect(result[1].expanded).toBe(true);
      expect(result[1].zg).toBe(93);
      expect(result[1].zd).toBe(69);

      expect(result[2]).toBe(c2);
      expect(result[3].expanded).toBe(true);
      expect(result[3].zg).toBe(76);
      expect(result[3].zd).toBe(49);

      expect(result[4]).toBe(c3);
    });
  });

  describe('未完成中枢（UnComplete）与边界防御', () => {
    it('末端未完成中枢实时参与延伸，融合后保持 UnComplete 状态', () => {
      const b0 = makeTestBi(0, TrendDirection.Up, 10, 30);
      const b1 = makeTestBi(1, TrendDirection.Down, 18, 28);
      const b2 = makeTestBi(2, TrendDirection.Up, 20, 32);
      const b3 = makeTestBi(3, TrendDirection.Down, 19, 29);
      const b4 = makeTestBi(4, TrendDirection.Up, 22, 38);

      const b5 = makeTestBi(5, TrendDirection.Down, 23, 35);
      const b6 = makeTestBi(6, TrendDirection.Up, 24, 37);
      const b7 = makeTestBi(7, TrendDirection.Down, 22, 34);

      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 28,
        zd: 20,
        gg: 38,
        dd: 10,
        trend: TrendDirection.Up,
        type: ChannelType.Complete,
      });

      // c2 为末端 4 笔未完结中枢
      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7],
        zg: 34,
        zd: 24,
        gg: 38,
        dd: 22,
        trend: TrendDirection.Up,
        type: ChannelType.UnComplete,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe(ChannelType.UnComplete);
    });

    it('末端未完成中枢参与扩展，大框标记为 UnComplete 状态', () => {
      const b0 = makeTestBi(0, TrendDirection.Down, 80, 100);
      const b1 = makeTestBi(1, TrendDirection.Up, 85, 95);
      const b2 = makeTestBi(2, TrendDirection.Down, 83, 93);
      const b3 = makeTestBi(3, TrendDirection.Up, 86, 96);
      const b4 = makeTestBi(4, TrendDirection.Down, 65, 90);

      const b5 = makeTestBi(5, TrendDirection.Up, 68, 78);
      const b6 = makeTestBi(6, TrendDirection.Down, 66, 76);
      const b7 = makeTestBi(7, TrendDirection.Up, 69, 79);

      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        trend: TrendDirection.Down,
        type: ChannelType.Complete,
      });

      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7],
        zg: 76,
        zd: 69,
        gg: 79,
        dd: 65,
        trend: TrendDirection.Down,
        type: ChannelType.UnComplete,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);
      expect(result.length).toBe(3);
      expect(result[1].type).toBe(ChannelType.UnComplete);
    });

    it('若前后中枢未共用连接笔，严格不触发延伸或扩展', () => {
      const b0 = makeTestBi(0, TrendDirection.Up, 10, 30);
      const b1 = makeTestBi(1, TrendDirection.Down, 18, 28);
      const b2 = makeTestBi(2, TrendDirection.Up, 20, 32);
      const b3 = makeTestBi(3, TrendDirection.Down, 19, 29);
      const b4 = makeTestBi(4, TrendDirection.Up, 22, 38);

      // c2 第一笔是独立的新笔 b5，与 b4 不是同一笔
      const b5 = makeTestBi(5, TrendDirection.Up, 22, 38);
      const b6 = makeTestBi(6, TrendDirection.Down, 23, 35);
      const b7 = makeTestBi(7, TrendDirection.Up, 24, 37);
      const b8 = makeTestBi(8, TrendDirection.Down, 22, 34);
      const b9 = makeTestBi(9, TrendDirection.Up, 26, 45);

      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 28,
        zd: 20,
        gg: 38,
        dd: 10,
        trend: TrendDirection.Up,
      });

      const c2 = makeMockChannel({
        bis: [b5, b6, b7, b8, b9],
        zg: 34,
        zd: 24,
        gg: 45,
        dd: 22,
        trend: TrendDirection.Up,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);
      // 不满足共用连接笔，原样保留
      expect(result.length).toBe(2);
      expect(result[0]).toBe(c1);
      expect(result[1]).toBe(c2);
    });

    it('若前后两中枢方向相反，严格不触发延伸或扩展', () => {
      const b0 = makeTestBi(0, TrendDirection.Up, 10, 30);
      const b1 = makeTestBi(1, TrendDirection.Down, 18, 28);
      const b2 = makeTestBi(2, TrendDirection.Up, 20, 32);
      const b3 = makeTestBi(3, TrendDirection.Down, 19, 29);
      const b4 = makeTestBi(4, TrendDirection.Up, 22, 38);

      const b5 = makeTestBi(5, TrendDirection.Down, 23, 35);
      const b6 = makeTestBi(6, TrendDirection.Up, 24, 37);
      const b7 = makeTestBi(7, TrendDirection.Down, 22, 34);
      const b8 = makeTestBi(8, TrendDirection.Up, 26, 45);

      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 28,
        zd: 20,
        gg: 38,
        dd: 10,
        trend: TrendDirection.Up,
      });

      // c2 为下跌中枢
      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 34,
        zd: 24,
        gg: 45,
        dd: 22,
        trend: TrendDirection.Down,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);
      expect(result.length).toBe(2);
      expect(result[0]).toBe(c1);
      expect(result[1]).toBe(c2);
    });

    it('若 ZD/ZG 与 DD/GG 均无交集（完全断层脱离），严格不触发延伸或扩展', () => {
      const b0 = makeTestBi(0, TrendDirection.Down, 80, 100);
      const b1 = makeTestBi(1, TrendDirection.Up, 85, 95);
      const b2 = makeTestBi(2, TrendDirection.Down, 83, 93);
      const b3 = makeTestBi(3, TrendDirection.Up, 86, 96);
      const b4 = makeTestBi(4, TrendDirection.Down, 40, 90);

      const b5 = makeTestBi(5, TrendDirection.Up, 25, 35);
      const b6 = makeTestBi(6, TrendDirection.Down, 23, 33);
      const b7 = makeTestBi(7, TrendDirection.Up, 26, 36);
      const b8 = makeTestBi(8, TrendDirection.Down, 10, 32);

      const c1 = makeMockChannel({
        bis: [b0, b1, b2, b3, b4],
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 40,
        trend: TrendDirection.Down,
      });

      // c2 的 gg=36 < c1 的 dd=40，完全断层
      const c2 = makeMockChannel({
        bis: [b4, b5, b6, b7, b8],
        zg: 33,
        zd: 26,
        gg: 36,
        dd: 10,
        trend: TrendDirection.Down,
      });

      const result = calculator.applyBiChannelExtensionAndExpansion([c1, c2]);
      expect(result.length).toBe(2);
      expect(result[0]).toBe(c1);
      expect(result[1]).toBe(c2);
    });
  });
});
