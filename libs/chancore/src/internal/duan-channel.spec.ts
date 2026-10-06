import {
  BiStatus,
  BiType,
  ChannelLevel,
  ChannelStatus,
  ChannelType,
  DuanStatus,
  DuanType,
  TrendDirection,
} from '../contracts';
import type { ChanBi, ChanDuan, ChanDuanChannel } from '../contracts';
import { DuanChannelCalculator } from './duan-channel';

describe('DuanChannelCalculator (段级中枢 7 大场景全景与 TDD 套件 3)', () => {
  describe('基础边界与确定性验证', () => {
    it('returns empty two-phase result for fewer than 4 Duan (needs 1 entry + 3 internal)', () => {
      const calc = new DuanChannelCalculator();
      expect(calc.createDuanChannels([])).toEqual({ phaseA: [], phaseB: [] });
      expect(
        calc.createDuanChannels([
          makeDuan('up', 10, 0, 0),
          makeDuan('down', 8, 2, 1),
        ]),
      ).toEqual({ phaseA: [], phaseB: [] });
      expect(
        calc.createDuanChannels([
          makeDuan('up', 10, 0, 0),
          makeDuan('down', 8, 2, 1),
          makeDuan('up', 9, 3, 2),
        ]),
      ).toEqual({ phaseA: [], phaseB: [] });
    });

    it('rejects a candidate whose symmetric overlap is degenerate (zg <= zd)', () => {
      // d0 up(5..10) 进入段
      // 内部 3 段：d1 down(0..5) d2 up(5..10) d3 down(0..5)：min高点=5 === max低点=5 → 无重叠区间，不成候选
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 5, 0),
        makeDuan('down', 5, 0, 1),
        makeDuan('up', 10, 5, 2),
        makeDuan('down', 5, 0, 3),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseA).toHaveLength(0);
      expect(result.phaseB).toHaveLength(0);
    });

    it('excludes an unconfirmed tail Duan (status unknown) from Duan-level Channel derivation', () => {
      const confirmed: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3),
      ];
      const tail = makeUncompleteDuan('up', 8, 4, 4);
      const calc = new DuanChannelCalculator();
      expect(calc.createDuanChannels([...confirmed, tail])).toEqual(
        calc.createDuanChannels(confirmed),
      );
    });

    it('is deterministic across repeated calls and does not mutate input', () => {
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3),
        makeDuan('up', 8, 4, 4),
      ];
      const calc = new DuanChannelCalculator();
      const first = calc.createDuanChannels(duans);
      const second = calc.createDuanChannels(duans);
      expect(second).toEqual(first);
      expect(duans.map((d) => d.high)).toEqual([10, 8, 9, 7, 8]);
    });
  });

  describe('初生核心与原典 a + 3 + b 同构架构 (Core Forming & Sealing)', () => {
    it('用例 1（测试组 A：4段初生核心确立）：1进 + 3内 构成标准初生未完结中枢 (a + A)', () => {
      // d0 up(0..10) 进入段
      // d1 down(2..8), d2 up(3..7), d3 down(3..6) -> 内部 3 段重叠 [ZD=3, ZG=6, GG=8, DD=2]
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 7, 3, 2),
        makeDuan('down', 6, 3, 3),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];

      expect(channel.level).toBe(ChannelLevel.Duan);
      expect(channel.type).toBe(ChannelType.UnComplete);
      expect(channel.status).toBe(ChannelStatus.Valid);
      expect(channel.entryDuan).toBe(duans[0]); // S0 进入段独立解耦
      expect(channel.leaveDuan).toBeUndefined(); // 未离开封存
      expect(channel.duans).toEqual([duans[1], duans[2], duans[3]]); // 纯内部振荡段严格为 3 段
      expect(channel.duans).toHaveLength(3);
      expect(channel.zg).toBe(6); // min(8, 7, 6)
      expect(channel.zd).toBe(3); // max(2, 3, 3)
      expect(channel.gg).toBe(8); // max(8, 7, 6)
      expect(channel.dd).toBe(2); // min(2, 3, 3)
      expect(channel.trend).toBe(TrendDirection.Up);
      expect('displayStartId' in channel).toBe(false);
      expect('displayEndId' in channel).toBe(false);
    });

    it('用例 2（测试组 B & D：原典第 57 课标准 10 线段复现与三卖完满封存）：1进 + 3内 + 1出 + 1回抽不破确认三卖 (a + A + b)', () => {
      // 原典 57 课实证模型（标准下跌走势类型 a + A + b）：
      // 01(d0) 进入段: down(150..100)
      // 12(d1), 23(d2), 34(d3) 构成中枢:
      //   d1 up(100..135), d2 down(115..135), d3 up(115..130) -> [ZD=115, ZG=130, GG=135, DD=100]
      // 45(d4) 次级别离开段: down(90..130) (顺势跌破 ZD 115 创 DD 新低 90)
      // 56(d5) 次级别反抽段: up(90..110) (反抽高点 110 < ZD 115 构成标准第三类卖点！)
      // 67(d6) 顺势延续: down(80..110)
      const duans: ChanDuan[] = [
        makeDuan('down', 150, 100, 0),
        makeDuan('up', 135, 100, 1),
        makeDuan('down', 135, 115, 2),
        makeDuan('up', 130, 115, 3),
        makeDuan('down', 130, 90, 4),
        makeDuan('up', 110, 90, 5),
        makeDuan('down', 110, 80, 6),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseB[0];

      expect(channel.level).toBe(ChannelLevel.Duan);
      expect(channel.type).toBe(ChannelType.Complete);
      expect(channel.status).toBe(ChannelStatus.Valid);
      expect(channel.entryDuan).toBe(duans[0]); // 01 进入段
      expect(channel.leaveDuan).toBe(duans[4]); // 45 离开段
      expect(channel.duans).toEqual([duans[1], duans[2], duans[3]]); // 12, 23, 34 纯内部振荡段（3段）
      expect(channel.duans).toHaveLength(3);
      expect(channel.zg).toBe(130);
      expect(channel.zd).toBe(115);
      expect(channel.gg).toBe(135);
      expect(channel.dd).toBe(100);
      expect(channel.trend).toBe(TrendDirection.Down);
    });

    it('用例 2b（测试组 B：剔除私加 GG/DD 门禁）：离开段未超过 GG 但回抽不破 ZG 依然确认三买完满封存', () => {
      // 标准上涨走势类型 a + A + b：
      // d0 up(100..150) 进入段
      // d1 down(120..150), d2 up(120..140), d3 down(125..140) -> [ZD=125, ZG=140, GG=150, DD=120]
      // d4 向上离开段: up(125..145) (突破 ZG 140，但未超过 GG 150)
      // d5 回抽段: down(142..145) (回抽低点 142 > ZG 140 确立三买！)
      const duans: ChanDuan[] = [
        makeDuan('up', 150, 100, 0),
        makeDuan('down', 150, 120, 1),
        makeDuan('up', 140, 120, 2),
        makeDuan('down', 140, 125, 3),
        makeDuan('up', 145, 125, 4),
        makeDuan('down', 145, 142, 5),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseB[0];

      expect(channel.type).toBe(ChannelType.Complete);
      expect(channel.leaveDuan).toBe(duans[4]); // 顺势突破 ZG 并被三买确认，完满封存
      expect(channel.duans).toEqual([duans[1], duans[2], duans[3]]);
      expect(channel.duans).toHaveLength(3);
      expect(channel.zg).toBe(140);
      expect(channel.zd).toBe(125);
    });
  });

  describe('原典第 20 课恒定区间与 7 大场景全景', () => {
    it('用例 3（原典第 20 课恒定区间 Invariant）：连续吸纳 4、5、6 段内部段，[ZD, ZG] 恒定不动态收窄', () => {
      // d0 进入段 + d1..d3 锁定初始 [ZD=3, ZG=8]
      // d4, d5 内部震荡，均触碰 [3, 8]
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 8, 3, 3),
        makeDuan('up', 7, 4, 4),
        makeDuan('down', 7.5, 5, 5),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];

      // 原典 20 课核心铁律：段中枢 [ZD, ZG] 恒定等于前 3 段锁定的区间 [3, 8]，绝不收敛为 [5, 7]！
      expect(channel.zd).toBe(3);
      expect(channel.zg).toBe(8);
      // 内部段包含 d1, d2, d3, d4, d5（共 5 段）
      expect(channel.duans).toHaveLength(5);
      expect(channel.entryDuan).toBe(duans[0]);
      expect(channel.leaveDuan).toBeUndefined();
      expect(channel.gg).toBe(9); // max(8, 9, 8, 7, 7.5)
      expect(channel.dd).toBe(2); // min(2, 3, 3, 4, 5)
    });

    it('用例 4（场景 1 与级别升级）：内部段延伸达到 9 段，expanded 为 true 且 upgradedLevel 为 Macro，血统仍为 Duan', () => {
      // d0 进入段 + 9 根内部震荡段 (d1..d9)，均触碰 [3, 8]
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3),
        makeDuan('up', 8, 4, 4),
        makeDuan('down', 7, 3.5, 5),
        makeDuan('up', 8.5, 4.5, 6),
        makeDuan('down', 7.5, 4, 7),
        makeDuan('up', 8, 3.8, 8),
        makeDuan('down', 7.2, 4.2, 9),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];

      expect(channel.duans).toHaveLength(9);
      expect(channel.expanded).toBe(true);
      expect(channel.upgradedLevel).toBe(ChannelLevel.Macro);
      expect(channel.level).toBe(ChannelLevel.Duan); // 物理血统永不丢失
    });

    it('用例 5（场景 2 向上三买离开）：curr.high > ZG 且 pullback.low > ZG，旧中枢在 curr 处完满封存', () => {
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3), // 内部震荡
        makeDuan('up', 14, 4, 4), // 向上突破离开段 (high 14 > ZG 8)
        makeDuan('down', 13, 9, 5), // 三买确认回抽段 (low 9 > ZG 8)
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseB[0];

      expect(channel.type).toBe(ChannelType.Complete);
      expect(channel.leaveDuan).toBe(duans[4]); // d4 为离开段
      expect(channel.duans).toHaveLength(3); // d1, d2, d3 为内部段
      expect(channel.duans).toEqual([duans[1], duans[2], duans[3]]);
      expect(channel.gg).toBe(9); // 内部段最高点，不被 d4(14) 污染
    });

    it('用例 6（场景 3 向下三卖离开）：curr.low < ZD 且 pullback.high < ZD，旧中枢向下完满封存', () => {
      const duans: ChanDuan[] = [
        makeDuan('down', 10, 0, 0),
        makeDuan('up', 8, 2, 1),
        makeDuan('down', 7, 1, 2), // [ZD=2, ZG=7]
        makeDuan('up', 6, 3, 3), // 内部震荡
        makeDuan('down', 5, -5, 4), // 向下跌破离开段 (low -5 < ZD 2)
        makeDuan('up', 1, -4, 5), // 三卖确认反弹段 (high 1 < ZD 2)
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseB[0];

      expect(channel.type).toBe(ChannelType.Complete);
      expect(channel.leaveDuan).toBe(duans[4]); // d4 为离开段
      expect(channel.duans).toHaveLength(3); // d1, d2, d3 为内部段
      expect(channel.dd).toBe(1); // 内部段最低点，不被 d4(-5) 污染
    });

    it('用例 7（场景 4 极值转折衰竭 2s/2b）：创 GG 新高后回踩未破 ZD，二次冲高未创新高走出二卖，封存离开', () => {
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2), // [ZD=3, ZG=8, GG=10, DD=0]
        makeDuan('down', 7, 4, 3),
        makeDuan('up', 15, 4, 4), // 冲破 GG(15 > 10)
        makeDuan('down', 14, 5, 5), // 回踩探至 5 (进入 [3, 8] 内部，三买失败，但 pullback.low >= ZD)
        makeDuan('up', 12, 5, 6), // 二次冲高至 12 (12 < 15，多头动能衰竭成二卖)
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseB[0];

      expect(channel.type).toBe(ChannelType.Complete);
      expect(channel.leaveDuan).toBe(duans[4]); // 在创极值的 d4 处封存离开
    });

    it('用例 8（场景 5 极限反向贯穿）：单段从高位直接向下暴穿 ZD 与 DD，以反向向下离开段完满封存', () => {
      // d0 进入段 + d1..d3 形成高位中枢 [ZD=7, ZG=8, DD=6, GG=11]
      // d4 顺势冲高至 12 (内部段，刷新 GG=12)
      // d5 极端反转大阴段直接暴跌贯穿至 0 (low 0 < d0.low 5)，作为反向向下离开段完满封存
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 5, 0),
        makeDuan('down', 9, 6, 1),
        makeDuan('up', 11, 7, 2),
        makeDuan('down', 8, 6, 3),
        makeDuan('up', 12, 6, 4),
        makeDuan('down', 12, 0, 5),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const channel = result.phaseB[0];

      // 遵循定理三与反向中立离开：d5 暴跌至 0，作为反向离开段完满封存
      expect(channel.type).toBe(ChannelType.Complete);
      expect(channel.leaveDuan).toBe(duans[5]);
      expect(channel.leaveDuan?.trend).toBe(TrendDirection.Down);
    });

    it('用例 9（场景 6 中枢新生强制闭合）：后续走势在不重叠区间走出独立新 3 段核心，旧中枢强制截断闭合', () => {
      // 旧中枢：d0 进入段 + d1..d3 形成核心 [ZD=4, ZG=7]
      // 后续段形成全新高台阶中枢：d4 up(4..18) 顺势离开作为新中枢进入段，d5..d7 走出新核心 [15, 18]
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3), // d0..d3 构成旧中枢 [ZD=4, ZG=7]
        makeDuan('up', 18, 4, 4), // 离开段 / 新中枢进入段
        makeDuan('down', 18, 14, 5), // 新中枢构件 1
        makeDuan('up', 20, 14, 6), // 新中枢构件 2
        makeDuan('down', 20, 15, 7), // 新中枢构件 3 -> 新核心 [15, 18]
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      // 应该生成两个独立中枢，旧中枢在 d4 前截断，新中枢独立建立
      expect(result.phaseB.length).toBeGreaterThanOrEqual(2);
      const first = result.phaseB[0];
      const second = result.phaseB[1];

      expect(first.type).toBe(ChannelType.Complete);
      expect(second.zg).toBe(18);
      expect(second.zd).toBe(15);
      expect(first.zg).toBeLessThanOrEqual(second.zd); // 阶梯跃迁，无交叉
    });

    it('用例 10（场景 7 数据尾部未完结）：走势在最新段未完结，输出 type 为 UnComplete', () => {
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 8, 2, 1),
        makeDuan('up', 9, 3, 2),
        makeDuan('down', 7, 4, 3),
      ];

      const result = new DuanChannelCalculator().createDuanChannels(duans);
      expect(result.phaseB).toHaveLength(1);
      const channel = result.phaseB[0];

      expect(channel.type).toBe(ChannelType.UnComplete);
      expect(channel.leaveDuan).toBeUndefined();
    });
  });

  describe('Phase B 扩展与延伸 (原典第 35 课定理三)', () => {
    it('两相邻同向下跌段中枢 [ZD, ZG] 无交集但 [DD, GG] 有交集，追加 Macro 级别外层扩展大框', () => {
      const d0 = makeDuan('down', 100, 80, 0);
      const d1 = makeDuan('up', 95, 85, 1);
      const d2 = makeDuan('down', 93, 83, 2);
      const d3 = makeDuan('up', 96, 86, 3);
      const d4 = makeDuan('down', 90, 65, 4); // 连接段

      const d5 = makeDuan('up', 78, 68, 5);
      const d6 = makeDuan('down', 76, 66, 6);
      const d7 = makeDuan('up', 79, 69, 7);
      const d8 = makeDuan('down', 75, 50, 8); // c2 离开段

      const c1: ChanDuanChannel = {
        duans: [d1, d2, d3],
        entryDuan: d0,
        leaveDuan: d4,
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 1,
        endId: 4,
      };

      const c2: ChanDuanChannel = {
        duans: [d5, d6, d7],
        entryDuan: d4,
        leaveDuan: d8,
        zg: 76,
        zd: 69,
        gg: 79,
        dd: 50,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 4,
        endId: 8,
      };

      const calc = new DuanChannelCalculator();
      const result = calc.applyDuanChannelExtensionAndExpansion([c1, c2]);

      expect(result.length).toBe(3);
      expect(result[0]).toEqual(
        expect.objectContaining({ ...c1, absorbed: true }),
      );
      expect(result[0].absorbed).toBe(true);

      const expandedBox = result[1];
      expect(expandedBox.expanded).toBe(true);
      expect(expandedBox.absorbed).toBe(false);
      expect(expandedBox.upgradedLevel).toBe(ChannelLevel.Macro);
      expect(expandedBox.level).toBe(ChannelLevel.Duan);
      expect(expandedBox.zg).toBe(93); // max(93, 76)
      expect(expandedBox.zd).toBe(69); // min(86, 69)
      expect(expandedBox.gg).toBe(100);
      expect(expandedBox.dd).toBe(50);
      expect(expandedBox.entryDuan).toBe(d0);
      expect(expandedBox.leaveDuan).toBe(d8);

      expect(result[2]).toEqual(
        expect.objectContaining({ ...c2, absorbed: true }),
      );
      expect(result[2].absorbed).toBe(true);
    });

    it('前一个中枢是 Macro 级别，后一个中枢是普通段中枢时，不进行定理二跨中枢扩展', () => {
      const d0 = makeDuan('down', 100, 80, 0);
      const d1 = makeDuan('up', 95, 85, 1);
      const d2 = makeDuan('down', 93, 83, 2);
      const d3 = makeDuan('up', 96, 86, 3);
      const d4 = makeDuan('down', 90, 65, 4); // 连接段

      const d5 = makeDuan('up', 78, 68, 5);
      const d6 = makeDuan('down', 76, 66, 6);
      const d7 = makeDuan('up', 79, 69, 7);
      const d8 = makeDuan('down', 75, 50, 8); // c2 离开段

      // c1 内部有 9 段，已升级为 Macro
      const macroDuans = [
        d1,
        d2,
        d3,
        makeDuan('down', 92, 84, 11),
        makeDuan('up', 94, 85, 12),
        makeDuan('down', 91, 84, 13),
        makeDuan('up', 95, 86, 14),
        makeDuan('down', 92, 85, 15),
        makeDuan('up', 93, 86, 16),
      ];

      const c1: ChanDuanChannel = {
        duans: macroDuans,
        entryDuan: d0,
        leaveDuan: d4,
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        level: ChannelLevel.Duan,
        upgradedLevel: ChannelLevel.Macro,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: true,
        startId: 1,
        endId: 4,
      };

      const c2: ChanDuanChannel = {
        duans: [d5, d6, d7],
        entryDuan: d4,
        leaveDuan: d8,
        zg: 76,
        zd: 69,
        gg: 79,
        dd: 50,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 4,
        endId: 8,
      };

      const calc = new DuanChannelCalculator();
      const result = calc.applyDuanChannelExtensionAndExpansion([c1, c2]);

      // 刚性门禁：c1 为 Macro，c2 为普通段中枢，级别不同，禁止扩展！结果严格保持为 [c1, c2]
      expect(result.length).toBe(2);
      expect(result[0]).toBe(c1);
      expect(result[1]).toBe(c2);
    });

    it('所有参与扩展的内容均被消耗，不进入下一次判断扩展', () => {
      // c1 与 c2 扩展，c2 与 c3 虽然极值也有交集，但 c2 已经被 c1 消耗，不得与 c3 再次扩展
      const d0 = makeDuan('down', 100, 80, 0);
      const d1 = makeDuan('up', 95, 85, 1);
      const d2 = makeDuan('down', 93, 83, 2);
      const d3 = makeDuan('up', 96, 86, 3);
      const d4 = makeDuan('down', 90, 65, 4); // c1 离开段 / c2 进入段

      const d5 = makeDuan('up', 78, 68, 5);
      const d6 = makeDuan('down', 76, 66, 6);
      const d7 = makeDuan('up', 79, 69, 7);
      const d8 = makeDuan('down', 75, 55, 8); // c2 离开段 / c3 进入段

      const d9 = makeDuan('up', 65, 50, 9);
      const d10 = makeDuan('down', 63, 48, 10);
      const d11 = makeDuan('up', 64, 52, 11);
      const d12 = makeDuan('down', 60, 40, 12); // c3 离开段

      const c1: ChanDuanChannel = {
        duans: [d1, d2, d3],
        entryDuan: d0,
        leaveDuan: d4,
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 1,
        endId: 4,
      };

      const c2: ChanDuanChannel = {
        duans: [d5, d6, d7],
        entryDuan: d4,
        leaveDuan: d8,
        zg: 76,
        zd: 69,
        gg: 79,
        dd: 55,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 4,
        endId: 8,
      };

      const c3: ChanDuanChannel = {
        duans: [d9, d10, d11],
        entryDuan: d8,
        leaveDuan: d12,
        zg: 64,
        zd: 50,
        gg: 65,
        dd: 40,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 8,
        endId: 12,
      };

      const calc = new DuanChannelCalculator();
      const result = calc.applyDuanChannelExtensionAndExpansion([c1, c2, c3]);
      expect(result.length).toBe(4);
      expect(result[0]).toEqual(
        expect.objectContaining({ ...c1, absorbed: true }),
      );
      expect(result[0].absorbed).toBe(true);
      expect(result[1].expanded).toBe(true);
      expect(result[1].absorbed).toBe(false);
      expect(result[2]).toEqual(
        expect.objectContaining({ ...c2, absorbed: true }),
      );
      expect(result[2].absorbed).toBe(true);
      expect(result[3]).toBe(c3);
      expect(result[3].absorbed).toBeFalsy();
    });

    it('合并同级相邻重叠中枢（延伸 Extension）为 single extended channel', () => {
      const calc = new DuanChannelCalculator();
      const d0 = makeDuan('up', 10, 0, 0);
      const d1 = makeDuan('down', 8, 2, 1);
      const d2 = makeDuan('up', 9, 3, 2);
      const d3 = makeDuan('down', 7, 4, 3);
      const d4 = makeDuan('up', 8, 5, 4);
      const d5 = makeDuan('down', 7, 5, 5);

      const c1: ChanDuanChannel = {
        duans: [d1, d2, d3],
        entryDuan: d0,
        leaveDuan: d3,
        zg: 8,
        zd: 3,
        gg: 10,
        dd: 0,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Up,
        startId: 1,
        endId: 202,
        expanded: false,
      };

      const c2: ChanDuanChannel = {
        duans: [d3, d4, d5],
        entryDuan: d3,
        leaveDuan: d5,
        zg: 7,
        zd: 5,
        gg: 9,
        dd: 4,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Up,
        startId: 201,
        endId: 402,
        expanded: false,
      };

      const merged = calc.applyDuanChannelExtensionAndExpansion([c1, c2]);
      expect(merged).toHaveLength(1);
      expect(merged[0].zg).toBe(7); // min(8, 7)
      expect(merged[0].zd).toBe(5); // max(3, 5)
      expect(merged[0].extended).toBe(true);
      expect(merged[0].trend).toBe(TrendDirection.Up);
    });

    it('validates candidate channel correctly with isCandidateChannelValid', () => {
      const calc = new DuanChannelCalculator();
      const d0 = makeDuan('up', 10, 0, 0);
      const d1 = makeDuan('down', 8, 2, 1);
      const d2 = makeDuan('up', 9, 3, 2);
      const d3 = makeDuan('down', 7, 4, 3);
      const validChannel: ChanDuanChannel = {
        duans: [d1, d2, d3],
        entryDuan: d0,
        leaveDuan: d3,
        zg: 8,
        zd: 3,
        gg: 9,
        dd: 2,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Up,
        startId: 1,
        endId: 2,
        expanded: false,
      };
      expect(calc.isCandidateChannelValid(validChannel)).toBe(true);

      const invalidLength: ChanDuanChannel = {
        ...validChannel,
        duans: [d1, d2], // < 3 构件不可构成中枢
      };
      expect(calc.isCandidateChannelValid(invalidLength)).toBe(false);

      const invalidOverlap: ChanDuanChannel = {
        ...validChannel,
        zg: 5,
        zd: 5,
      };
      expect(calc.isCandidateChannelValid(invalidOverlap)).toBe(false);
    });

    it('连续走势链路承接 (a + A + b + B + c)：前一中枢的离开段 b 必然作为后继中枢的进入段 a', () => {
      // 中枢1 (d0..d3): 核心 [5, 8]
      // d0 up(0..10), d1 down(4..10), d2 up(4..8), d3 down(5..8) -> 内部3段 d1..d3
      // d4 向上冲破离开 (5..20) 并在 d5(15..20) 确立三买离开！
      // 随后在 20 附近震荡形成中枢 2: d4 为进入段，d5, d6, d7 构成内部3段: d5 down(15..20), d6 up(15..19), d7 down(16..19)
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 10, 4, 1),
        makeDuan('up', 8, 4, 2),
        makeDuan('down', 8, 5, 3),
        makeDuan('up', 20, 5, 4), // 主升离开段 d4
        makeDuan('down', 20, 15, 5), // 回抽三买 d5
        makeDuan('up', 19, 15, 6), // 震荡 d6
        makeDuan('down', 19, 16, 7), // 震荡 d7
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans);

      expect(result.phaseA.length).toBeGreaterThanOrEqual(2);
      const first = result.phaseA[0];
      const second = result.phaseA[1];

      // 前一中枢在 d4 处确认离开
      expect(first.leaveDuan).toBeDefined();
      expect(first.leaveDuan).toBe(duans[4]);

      // 后继中枢必须以 d4 作为进入段 a！
      expect(second.entryDuan).toBe(duans[4]);
      expect(first.leaveDuan).toBe(second.entryDuan);
    });

    it('Phase B 自动激活延伸与扩展 (无需外部手动重复调用 applyDuanChannelExtensionAndExpansion)', () => {
      // 构造 [ZD, ZG] 无交集但 [DD, GG] 有重叠的用例
      const duans: ChanDuan[] = [
        makeDuan('up', 10, 0, 0),
        makeDuan('down', 10, 2, 1),
        makeDuan('up', 8, 2, 2),
        makeDuan('down', 8, 6, 3),
        makeDuan('up', 14, 6, 4),
        makeDuan('down', 14, 9, 5),
        makeDuan('up', 15, 9, 6),
        makeDuan('down', 15, 11, 7),
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans);

      // Phase B 自动激活中枢扩展：输出 [c1, expandedBox, c2]
      expect(result.phaseB.length).toBe(3);
      expect(result.phaseB[0].expanded).toBe(false);
      expect(result.phaseB[1].expanded).toBe(true);
      expect(result.phaseB[1].upgradedLevel).toBe(ChannelLevel.Macro);
      expect(result.phaseB[2].expanded).toBe(false);
    });

    it('多段中枢延伸与独立：核心 [ZD, ZG] 无重叠的中枢保持独立，核心重叠的中枢链式合并延伸', () => {
      const calc = new DuanChannelCalculator();
      const d0 = makeDuan('up', 100, 80, 0);
      const d1 = makeDuan('down', 95, 85, 1);
      const d2 = makeDuan('up', 93, 83, 2);
      const d3 = makeDuan('down', 96, 86, 3);
      const d4 = makeDuan('down', 90, 65, 4);

      const d5 = makeDuan('up', 80, 70, 5);
      const d6 = makeDuan('down', 78, 68, 6);
      const d7 = makeDuan('up', 82, 72, 7);
      const d8 = makeDuan('down', 85, 55, 8);

      const d9 = makeDuan('up', 83, 73, 9);
      const d10 = makeDuan('down', 81, 71, 10);
      const d11 = makeDuan('up', 84, 74, 11);
      const d12 = makeDuan('down', 90, 60, 12);

      const c1: ChanDuanChannel = {
        duans: [d1, d2, d3],
        entryDuan: d0,
        leaveDuan: d4,
        zg: 93,
        zd: 86,
        gg: 100,
        dd: 65,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Up,
        expanded: false,
        startId: 1,
        endId: 500,
      };

      const c2: ChanDuanChannel = {
        duans: [d5, d6, d7],
        entryDuan: d4,
        leaveDuan: d8,
        zg: 76,
        zd: 69,
        gg: 85,
        dd: 55,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 401,
        endId: 900,
      };

      const c3: ChanDuanChannel = {
        duans: [d9, d10, d11],
        entryDuan: d8,
        leaveDuan: d12,
        zg: 80,
        zd: 71,
        gg: 90,
        dd: 60,
        level: ChannelLevel.Duan,
        type: ChannelType.Complete,
        status: ChannelStatus.Valid,
        trend: TrendDirection.Down,
        expanded: false,
        startId: 801,
        endId: 1300,
      };

      const result = calc.applyDuanChannelExtensionAndExpansion([c1, c2, c3]);
      // c1 与 c2 核心无重叠且中枢扩展已停用，保持独立
      // c2 与 c3 核心 [69, 76] 与 [71, 80] 存在交集 [71, 76]，自动合并延伸
      expect(result.length).toBe(2); // [c1, merged_c2_c3]
      expect(result[0]).toBe(c1);

      const mergedC2C3 = result[1];
      expect(mergedC2C3.extended).toBe(true);
      expect(mergedC2C3.zg).toBe(76);
      expect(mergedC2C3.zd).toBe(71);
      expect(mergedC2C3.trend).toBe(TrendDirection.Down);
    });
  });

  describe('段中枢原典分叉特性（构件数量放开、离开段方向中立与反向离开封存）', () => {
    it('分叉特性 1（上涨中枢反向向下离开与三卖确认）：内部段数为 4 根（偶数段），离开段为 Down，确认三卖完满封存', () => {
      // 构造：上涨进入 -> 4 内部段 -> 向下离开 -> 反抽确认三卖
      const duans: ChanDuan[] = [
        makeDuan('up', 150, 100, 0), // a 进入段 (Up, 起点 100)
        makeDuan('down', 150, 120, 1), // A 内部段 1 (Down)
        makeDuan('up', 140, 120, 2), // A 内部段 2 (Up)
        makeDuan('down', 140, 125, 3), // A 内部段 3 (Down) -> 初生核心确立: [zd: 125, zg: 140]
        makeDuan('up', 135, 125, 4), // A 内部段 4 (Up, 震荡于 125~135)
        makeDuan('down', 135, 110, 5), // b 反向离开段 (Down, 跌破 zd: 125, 最低 110)
        makeDuan('up', 122, 110, 6), // 回抽段 (Up, 最高 122 < zd 125，三卖确认！)
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans);

      // 验证封存中枢
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const ch = result.phaseB[0];
      expect(ch.type).toBe(ChannelType.Complete);
      expect(ch.trend).toBe(TrendDirection.Up); // 中枢方向由进入段决定
      expect(ch.leaveDuan).toBeDefined();
      expect(ch.leaveDuan!.trend).toBe(TrendDirection.Down); // 反向离开！
      expect(ch.duans.length).toBe(4); // 内部段为 4 根（偶数段！）
      expect(ch.zg).toBe(140);
      expect(ch.zd).toBe(125);
    });

    it('分叉特性 2（下跌中枢反向向上离开与三买确认）：内部段数为 4 根（偶数段），离开段为 Up，确认三买完满封存', () => {
      // 构造：下跌进入 -> 4 内部段 -> 向上离开 -> 次回试确认三买
      const duans: ChanDuan[] = [
        makeDuan('down', 150, 100, 0), // a 进入段 (Down)
        makeDuan('up', 120, 100, 1), // A 内部段 1 (Up)
        makeDuan('down', 120, 105, 2), // A 内部段 2 (Down)
        makeDuan('up', 115, 105, 3), // A 内部段 3 (Up) -> 初生核心确立: [zd: 105, zg: 115]
        makeDuan('down', 115, 108, 4), // A 内部段 4 (Down, 震荡于 105~115)
        makeDuan('up', 130, 108, 5), // b 反向离开段 (Up, 突破 zg: 115, 最高 130)
        makeDuan('down', 130, 118, 6), // 次回试段 (Down, 最低 118 > zg 115，三买确认！)
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans);

      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const ch = result.phaseB[0];
      expect(ch.type).toBe(ChannelType.Complete);
      expect(ch.trend).toBe(TrendDirection.Down); // 中枢方向由进入段决定
      expect(ch.leaveDuan).toBeDefined();
      expect(ch.leaveDuan!.trend).toBe(TrendDirection.Up); // 反向离开！
      expect(ch.duans.length).toBe(4); // 内部段为 4 根（偶数段！）
      expect(ch.zg).toBe(115);
      expect(ch.zd).toBe(105);
    });

    it('分叉特性 3（反向暴跌击穿进入段起点不崩溃）：核心成型后向下跌破 a.low，以反向离开段完满封存', () => {
      // 构造：上涨进入 (起点 100) -> 3 内部段 -> 随后暴跌穿透 100 (跌到 80)
      const duans: ChanDuan[] = [
        makeDuan('up', 150, 100, 0), // a 进入段 (起点 100)
        makeDuan('down', 150, 120, 1), // A 内部段 1
        makeDuan('up', 140, 120, 2), // A 内部段 2
        makeDuan('down', 140, 125, 3), // A 内部段 3 -> 核心确立: [zd: 125, zg: 140]
        makeDuan('up', 135, 125, 4), // A 内部段 4
        makeDuan('down', 135, 80, 5), // 暴跌击穿 a.low (100)
        makeDuan('up', 95, 80, 6), // 反抽仍在 95 (< zd 125)
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans);

      // 段中枢绝不崩塌丢弃，而是以该向下段封存
      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const ch = result.phaseB[0];
      expect(ch.entryDuan.originIds[0]).toBe(1); // 成功保留以 d0 为进入段的中枢
      expect(ch.leaveDuan).toBeDefined();
      expect(ch.leaveDuan!.trend).toBe(TrendDirection.Down);
    });

    it('分叉特性 4（多段连续吸纳 5、6 段）：内部段数支持任意整数 >= 3', () => {
      // 构造内部 6 段震荡
      const duans: ChanDuan[] = [
        makeDuan('up', 150, 100, 0), // a
        makeDuan('down', 150, 120, 1), // 1
        makeDuan('up', 140, 120, 2), // 2
        makeDuan('down', 140, 125, 3), // 3
        makeDuan('up', 138, 126, 4), // 4
        makeDuan('down', 138, 126, 5), // 5
        makeDuan('up', 136, 126, 6), // 6 (内部第 6 段)
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans, { allowUncomplete: true });
      expect(result.phaseB.length).toBe(1);
      const ch = result.phaseB[0];
      expect(ch.duans.length).toBe(6); // 内部 6 段（偶数段！）
      expect(ch.type).toBe(ChannelType.UnComplete);
    });

    it('分叉特性 5（000001 5m 真实行情实盘复现）：d94~d102 向上进入 + 内部宽幅震荡吸纳 6 段（含跌穿起点刷新 DD 与冲顶刷新 GG）+ d101 反向向下离开 + d102 确认三卖完满封存', () => {
      // 真实数据 000001 5m（2026-01-20 ~ 2026-02-04）：
      // d94: entry (up, [4080.29, 4140.84])
      // d95: internal 1 (down, [4109.92, 4140.84])
      // d96: internal 2 (up, [4109.92, 4160.99])
      // d97: internal 3 (down, [4101.83, 4160.99]) -> 核心 [zd: 4109.92, zg: 4140.84]
      // d98: internal 4 (up, [4101.83, 4170.15]) -> 冲顶刷新 GG=4170.15
      // d99: internal 5 (down, [4064.78, 4170.21]) -> 跌穿起点刷新 DD=4064.78，但横穿 [zd, zg]，原典定理一平滑吸纳！
      // d100: internal 6 (up, [4064.78, 4138.81]) -> 反弹至 4138.81 重回核心区间内吸纳！
      // d101: leaveDuan (down, [4002.78, 4138.81]) -> 暴跌跌穿 zd (4002.78 < 4109.92)
      // d102: 3卖确认段 (up, [4002.78, 4104.62]) -> 反抽最高 4104.62 < zd 4109.92，确认三卖完满封存！
      const duans: ChanDuan[] = [
        makeDuan('up', 4140.84, 4080.29, 94),
        makeDuan('down', 4140.84, 4109.92, 95),
        makeDuan('up', 4160.99, 4109.92, 96),
        makeDuan('down', 4160.99, 4101.83, 97),
        makeDuan('up', 4170.15, 4101.83, 98),
        makeDuan('down', 4170.21, 4064.78, 99),
        makeDuan('up', 4138.81, 4064.78, 100),
        makeDuan('down', 4138.81, 4002.78, 101),
        makeDuan('up', 4104.62, 4002.78, 102),
      ];

      const calc = new DuanChannelCalculator();
      const result = calc.createDuanChannels(duans);

      expect(result.phaseB.length).toBeGreaterThanOrEqual(1);
      const ch = result.phaseB[0];
      expect(ch.type).toBe(ChannelType.Complete);
      expect(ch.entryDuan.originIds[0]).toBe(9401);
      expect(ch.duans.length).toBe(6); // 内部吸纳 6 段！
      expect(ch.zg).toBe(4140.84);
      expect(ch.zd).toBe(4109.92);
      expect(ch.gg).toBe(4170.21);
      expect(ch.dd).toBe(4064.78);
      expect(ch.leaveDuan).toBeDefined();
      expect(ch.leaveDuan!.originIds[0]).toBe(10101); // d101 离开
      expect(ch.leaveDuan!.trend).toBe(TrendDirection.Down); // 反向离开
    });
  });
});

/** 构造最小 ChanDuan（段级中枢只读 startTime/endTime/high/low/trend/originIds）。 */
function makeDuan(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanDuan {
  const startTime = new Date(2026, 6, 1, 9, id * 10, 0, 0);
  const endTime = new Date(2026, 6, 1, 9, (id + 1) * 10, 0, 0);
  const startBi: ChanBi = {
    startTime,
    endTime,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
  return {
    startTime,
    endTime,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: DuanType.Complete,
    status: DuanStatus.Valid,
    independentCount: 1,
    originIds: [id * 100 + 1, id * 100 + 2],
    originBis: [startBi],
    startBi,
    endBi: startBi,
  };
}

/**
 * 未确认尾段（UnComplete / status=Unknown / endBi=null）——
 * 18 课"次级别前三个走势类型都是完成的才构成中枢"：不得进入段中枢。
 */
function makeUncompleteDuan(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanDuan {
  return {
    ...makeDuan(trend, high, low, id),
    type: DuanType.UnComplete,
    status: DuanStatus.Unknown,
    endBi: null,
  };
}
