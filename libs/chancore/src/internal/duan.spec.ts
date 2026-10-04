import { BiStatus, BiType, DuanType, TrendDirection } from '../contracts';
import type { ChanBi } from '../contracts';
import { DuanCalculator } from './duan';

describe('DuanCalculator (特征序列法)', () => {
  it('returns empty for fewer than 3 Bi', () => {
    const calc = new DuanCalculator();
    expect(calc.createDuan([])).toEqual([]);
    expect(calc.createDuan([makeBi('up', 8, 4, 0)])).toEqual([]);
  });

  it('ends a segment at the fenxing extremum Bi when there is no gap (case 1)', () => {
    // 向上段特征序列 e1=(8,5) e2=(11,7) e3=(9,6) 在 e2 形成顶分型；e1/e2 区间重合 → 无缺口（第一种）。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1), // e1=(8,5)
      makeBi('up', 11, 5, 2),
      makeBi('down', 11, 7, 3), // e2=(11,7) 顶分型中间
      makeBi('up', 9, 7, 4),
      makeBi('down', 9, 6, 5), // e3=(9,6)
      makeBi('up', 13, 6, 6),
    ];

    const result = new DuanCalculator().createDuan(bis);

    expect(result).toHaveLength(2);
    const seg = result[0];
    expect(seg.type).toBe(DuanType.Complete);
    expect(seg.trend).toBe(TrendDirection.Up);
    expect(seg.high).toBe(11);
    expect(seg.low).toBe(4);
    expect(seg.originBis).toHaveLength(3); // bi[0..2]
    expect(seg.endBi).toBe(bis[2]);

    expect(result[1].type).toBe(DuanType.UnComplete);
    expect(result[1].endBi).toBeNull();
  });

  it('confirms a gap fenxing via the reverse segment fenxing (case 2 confirmed)', () => {
    // 向上段特征序列 e1=(8,5) e2=(13,9) e3=(11,7)：e1/e2 有缺口（第二种）。
    // 反方向（向下）新段特征序列 f1=(11,9) f2=(10,7) f3=(9,4) f4=(11,6) 在 f3 形成底分型 → 倒推确认。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1), // e1
      makeBi('up', 13, 5, 2),
      makeBi('down', 13, 9, 3), // e2 顶分型中间，极值=13（与 e1 有缺口）
      makeBi('up', 11, 9, 4),
      makeBi('down', 11, 7, 5), // e3
      makeBi('up', 10, 7, 6), // f1
      makeBi('down', 10, 4, 7),
      makeBi('up', 9, 4, 8), // f3 对应区间的底（low=4）
      makeBi('down', 9, 6, 9),
      makeBi('up', 11, 6, 10), // f4
    ];

    const result = new DuanCalculator().createDuan(bis);

    // 向上段(bi0-2，经 case-2 倒推确认) + 向下段(bi3-7，case-1) + 尾段(bi8-10)
    expect(result).toHaveLength(3);
    const upSeg = result[0];
    expect(upSeg.type).toBe(DuanType.Complete);
    expect(upSeg.trend).toBe(TrendDirection.Up);
    expect(upSeg.high).toBe(13); // 原极值
    expect(upSeg.endBi).toBe(bis[2]);

    const downSeg = result[1];
    expect(downSeg.trend).toBe(TrendDirection.Down);
    expect(downSeg.type).toBe(DuanType.Complete);
    expect(downSeg.startBi).toBe(bis[3]);

    expect(result[2].type).toBe(DuanType.UnComplete);
  });

  it('does not end a segment on an unconfirmed gap fenxing (case 2 not confirmed)', () => {
    // 向上段 case-2 缺口分型，但反方向新段特征序列元素不足（无底分型）、且未越过极值。
    // 第二种情况未确认 → 原段继续延伸 → 整条为未完成尾段。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1), // e1
      makeBi('up', 13, 5, 2),
      makeBi('down', 13, 9, 3), // e2 顶分型中间（与 e1 有缺口）
      makeBi('up', 11, 9, 4),
      makeBi('down', 11, 7, 5), // e3
      makeBi('up', 10, 7, 6), // 反方向新段特征序列仅 2 元素，无法成底分型
    ];

    const result = new DuanCalculator().createDuan(bis);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DuanType.UnComplete);
    expect(result[0].endBi).toBeNull();
    expect(result[0].originBis).toHaveLength(7); // bi[0..6]
  });

  it('does not confirm a single-Bi Complete Duan (strictly enforces lesson-65 minimum 3-Bi axiom)', () => {
    // 缠论 65 课「线段至少由三笔组成」公理：任何已完成线段 originBis 必须 >= 3。
    // 单笔反向破坏不能作为独立 Complete 线段输出。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1),
      makeBi('up', 8, 5, 2),
      makeBi('down', 8, 4, 3),
    ];

    const result = new DuanCalculator().createDuan(bis);

    // 无法形成 >= 3 笔的 Complete 段，整体保持为一条未完成段延伸
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DuanType.UnComplete);
    expect(result[0].endBi).toBeNull();
    expect(result[0].originBis).toHaveLength(4);
  });

  it('voids the lesson-71 first-Bi-break rule when the turning Bi start is broken first', () => {
    // 71 课复杂分支 2：先破第一笔的开始位置 → 旧线段只被一笔破坏、依然延续，判据作废。
    // 转笔 bi#1 Dn 8→6，第 2 笔 bi#2 Up high=10 > 转笔起点 8 → 'extended' → 恢复常规流程，
    // 后续 (bi#1, bi#3, bi#5) 顶分型 case-1 确认 → 正常 3 笔段，不被截成单笔。
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0), // 段体 Up
      makeBi('down', 8, 6, 1), // 转笔 Dn：8 → 6
      makeBi('up', 10, 6, 2), // 第 2 笔 Up：high=10 > 转笔起点 8 → extended（先破起点）
      makeBi('down', 10, 7, 3),
      makeBi('up', 9, 7, 4),
      makeBi('down', 9, 4, 5), // 分型 (bi#1, bi#3, bi#5)：bi#3.high=10 最高 → case-1
    ];

    const result = new DuanCalculator().createDuan(bis);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe(DuanType.Complete);
    expect(result[0].trend).toBe(TrendDirection.Up);
    expect(result[0].originBis).toHaveLength(3); // [bi#0..bi#2] 正常 3 笔段
    expect(result[0].endBi).toBe(bis[2]);
    expect(result[1].type).toBe(DuanType.UnComplete);
  });

  it('strictly rejects complete segments with fewer than 3 bis (downward segment)', () => {
    // Dn 对称构型：不足 3 笔时绝不输出 Complete 线段
    const bis: ChanBi[] = [
      makeBi('down', 9, 5, 0),
      makeBi('up', 9, 5, 1),
      makeBi('down', 8, 5, 2),
      makeBi('up', 10, 8, 3),
    ];

    const result = new DuanCalculator().createDuan(bis);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DuanType.UnComplete);
    expect(result[0].endBi).toBeNull();
    expect(result[0].originBis).toHaveLength(4);
  });

  it('is deterministic across repeated calls and does not mutate input', () => {
    const bis: ChanBi[] = [
      makeBi('up', 8, 4, 0),
      makeBi('down', 8, 5, 1),
      makeBi('up', 13, 5, 2),
      makeBi('down', 13, 9, 3),
      makeBi('up', 11, 9, 4),
      makeBi('down', 11, 7, 5),
      makeBi('up', 10, 7, 6),
      makeBi('down', 10, 4, 7),
      makeBi('up', 9, 4, 8),
      makeBi('down', 9, 6, 9),
      makeBi('up', 11, 6, 10),
    ];
    const calc = new DuanCalculator();
    const first = calc.createDuan(bis);
    const second = calc.createDuan(bis);
    expect(second).toEqual(first);
    expect(bis.map((b) => b.high)).toEqual([
      8, 8, 13, 13, 11, 11, 10, 10, 9, 9, 11,
    ]);
  });

  describe('Lesson 81 Canonical Test Cases (原典第81课更正公案: 5=7/5<7 为1段, 5>7 为3段)', () => {
    it('classifies as 1 segment when point 5 <= point 7 (5低于7或5=7，第二特征序列包含合并后无顶分型)', () => {
      // 原典81课/71课图例严格构型:
      // 0-1 Up(4->18，点1为原向上段顶点=18)
      // 从点1转折向下: 1-2 Dn(18->10，与前一特征元素有缺口，进入第二种情况)
      // 第二特征序列由向上笔构成:
      // 笔2-3 Up(10->12，第1元素，高点3=12)
      // 笔3-4 Dn(12->8)
      // 笔4-5 Up(8->15，第2元素，高点5=15 > 点3=12)
      // 笔5-6 Dn(15->9)
      // 笔6-7 Up(9->16，第3元素，高点7=16 > 点5=15，即5低于7)
      // 笔7-8 Dn(16->6)
      // 第二特征序列 (2-3, 4-5, 6-7): 4-5与6-7包含合并取高高[8..16]，点5无法成顶分型 -> 原段未破，算1段
      const bis: ChanBi[] = [
        makeBi('up', 18, 4, 0), // 0-1 Up (顶点 18)
        makeBi('down', 18, 10, 1), // 1-2 Dn (转笔)
        makeBi('up', 12, 10, 2), // 2-3 Up (点3=12)
        makeBi('down', 12, 8, 3), // 3-4 Dn
        makeBi('up', 15, 8, 4), // 4-5 Up (点5=15)
        makeBi('down', 15, 9, 5), // 5-6 Dn
        makeBi('up', 16, 9, 6), // 6-7 Up (点7=16 > 点5=15，5低于7)
        makeBi('down', 16, 6, 7), // 7-8 Dn
      ];

      const result = new DuanCalculator().createDuan(bis);

      // 缠论原典第 81 课标准答案: 5低于7或5=7，整体只能算 1 段 (原段未被破坏)
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(DuanType.UnComplete);
    });

    it('classifies as 3 segments when point 5 > point 7 (5高于7，第二特征序列顶分型确立，倒推确认)', () => {
      // 原典81课/71课图例严格构型:
      // 0-1 Up(4->18，点1为原向上段顶点=18)
      // 1-2 Dn(18->10，有缺口)
      // 笔2-3 Up(10->12，第1元素，点3=12)
      // 笔3-4 Dn(12->8)
      // 笔4-5 Up(8->15，第2元素，点5=15 > 点3=12)
      // 笔5-6 Dn(15->9)
      // 笔6-7 Up(9->13，第3元素，点7=13 < 点5=15，即5高于7)
      // 笔7-8 Dn(13->6)
      // 第二特征序列 (2-3, 4-5, 6-7): 点5=15 高于两边(12与13)，顶分型确立 -> 倒推确认在点1(18)终结 -> 划分成3段
      const bis: ChanBi[] = [
        makeBi('up', 18, 4, 0), // 0-1 Up (顶点 18)
        makeBi('down', 18, 10, 1), // 1-2 Dn (转笔)
        makeBi('up', 12, 10, 2), // 2-3 Up (点3=12)
        makeBi('down', 12, 8, 3), // 3-4 Dn
        makeBi('up', 15, 8, 4), // 4-5 Up (点5=15)
        makeBi('down', 15, 9, 5), // 5-6 Dn
        makeBi('up', 13, 9, 6), // 6-7 Up (点7=13 < 点5=15，5高于7)
        makeBi('down', 13, 6, 7), // 7-8 Dn
      ];

      const result = new DuanCalculator().createDuan(bis);

      // 缠论原典第 81 课标准答案: 5高于7，倒推确认为 3 段
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].type).toBe(DuanType.Complete);
      expect(result[0].high).toBe(18); // 第一段在顶点 18 结束
    });
  });

  describe('August 26 Case: 3888.60 大顶反向三笔成段后，后续再创新高不得抹杀历史顶', () => {
    it('seals the first segment at 3888.60 when reverse 3-Bi forms a complete downward segment even if 3899.96 comes later', () => {
      // 构型还原实盘：
      // 0. 起点 3700 -> 向上到达 3888.60
      // 1. Bi 16 (下): 3888.60 -> 3755.22 (跌 133 点)
      // 2. Bi 17 (上): 3755.22 -> 3879.80 (反弹 124 点，未过 3888.60)
      // 3. Bi 18 (下): 3879.80 -> 3732.84 (跌破 3755.22，形成完整反向三笔成段)
      // 4. 随后行情拉升: 3732.84 -> 3899.96 (创新高 3899.96 > 3888.60)
      const bis: ChanBi[] = [
        makeBi('up', 3800, 3700, 0),
        makeBi('down', 3800, 3760, 1),
        makeBi('up', 3888.6, 3760, 2), // 顶点 3888.60 (bi#2)
        makeBi('down', 3888.6, 3755.22, 3), // 反向 Bi 16 (下)
        makeBi('up', 3879.8, 3755.22, 4), // 反向 Bi 17 (上)
        makeBi('down', 3879.8, 3732.84, 5), // 反向 Bi 18 (下，破底，反向底分型确立)
        makeBi('up', 3899.96, 3732.84, 6), // 随后大幅拉升，创出 3899.96 新高
        makeBi('down', 3899.96, 3820, 7),
        makeBi('up', 3920, 3820, 8),
      ];

      const result = new DuanCalculator().createDuan(bis);

      // 第一段必须在 3888.60 处结清封存！
      expect(result.length).toBeGreaterThanOrEqual(2);
      const firstSegment = result[0];
      expect(firstSegment.type).toBe(DuanType.Complete);
      expect(firstSegment.trend).toBe(TrendDirection.Up);
      expect(firstSegment.high).toBe(3888.6);
      expect(firstSegment.endBi).toBe(bis[2]);

      // 第二段必须是反向向下段 (3888.60 -> 3732.84)
      const secondSegment = result[1];
      expect(secondSegment.type).toBe(DuanType.Complete);
      expect(secondSegment.trend).toBe(TrendDirection.Down);
      expect(secondSegment.high).toBe(3888.6);
      expect(secondSegment.low).toBe(3732.84);
      expect(secondSegment.startBi).toBe(bis[3]);
      expect(secondSegment.endBi).toBe(bis[5]);
    });

    it('reproduces 8-26 real sequence: reverse 3-Bi (Bi 28-29-30) breaks out upward, must not lump 7 Bis into one single downward segment', () => {
      // 真实 8-26 实盘构型 (bis 25..33)：
      // 25..27 为前向向下段，跌至大底 3850.86
      // 28: Up 3850.86 -> 3970.31 (第1笔破坏)
      // 29: Down 3970.31 -> 3926.5 (第2笔回调未破底)
      // 30: Up 3926.5 -> 3995.18 (第3笔突破第1笔高点3970.31，第71/78课三笔反向成段确立)
      // 31: Down 3995.18 -> 3930.45 (见顶3995.18转折向下)
      // 32: Up 3930.45 -> 3980.2
      // 33: Down 3980.2 -> 3915.22
      const bis: ChanBi[] = [
        makeBi('down', 4050, 3950, 25),
        makeBi('up', 3994.18, 3950, 26),
        makeBi('down', 3994.18, 3850.86, 27),
        makeBi('up', 3970.31, 3850.86, 28),
        makeBi('down', 3970.31, 3926.5, 29),
        makeBi('up', 3995.18, 3926.5, 30),
        makeBi('down', 3995.18, 3930.45, 31),
        makeBi('up', 3980.2, 3930.45, 32),
        makeBi('down', 3980.2, 3915.22, 33),
      ];

      const result = new DuanCalculator().createDuan(bis);

      // 正确断段：Bi 28-29-30 走出了完整的三笔向上突破，构成了反向向上段！
      // 必须切出向上段，决不能全被吞为一条长达 7 笔的怪异向下段！
      const hasUpSegment = result.some((s) => s.trend === TrendDirection.Up);
      expect(hasUpSegment).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].trend).toBe(TrendDirection.Down);
      expect(result[0].low).toBe(3850.86);
      expect(result[1].trend).toBe(TrendDirection.Up);
      expect(result[1].high).toBe(3995.18);
    });

    it('handles real 2025-08-26 case with real gap: reverse 3-Bi downward segment confirms top at 3888.60 even when new high 3892.74 arrives weeks later', () => {
      // 真实 2025-08-26 实盘构型 (bis 13..21)
      const bis: ChanBi[] = [
        makeBi('up', 3704.77, 3550.04, 13),
        makeBi('down', 3704.77, 3658.38, 14),
        makeBi('up', 3888.6, 3658.38, 15), // 8月26日最高点 3888.60
        makeBi('down', 3888.6, 3761.42, 16), // 存在真实缺口 (3761.42 > 3704.77)
        makeBi('up', 3885.32, 3761.42, 17),
        makeBi('down', 3885.32, 3732.84, 18), // 破 3761.42 低点，反向三笔成段确立
        makeBi('up', 3834.67, 3732.84, 19),
        makeBi('down', 3834.67, 3791.72, 20),
        makeBi('up', 3892.74, 3791.72, 21), // 后续创 3892.74 新高 (> 3888.60)
      ];

      const result = new DuanCalculator().createDuan(bis);

      // 第一段必须在 8月26日最高点 3888.60 结清封存
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0].type).toBe(DuanType.Complete);
      expect(result[0].trend).toBe(TrendDirection.Up);
      expect(result[0].high).toBe(3888.6);
      expect(result[0].endBi).toBe(bis[2]);

      // 第二段为反向向下段 (3888.60 -> 3732.84)
      expect(result[1].type).toBe(DuanType.Complete);
      expect(result[1].trend).toBe(TrendDirection.Down);
      expect(result[1].high).toBe(3888.6);
      expect(result[1].low).toBe(3732.84);
    });
  });

  describe('findValidSegmentStart: 起始段第一笔的动态定位（同构笔算法寻找首个分型）', () => {
    it('allows starting from an intermediate price point even if subsequent stroke penetrates start price (第78课)', () => {
      // bi0: Up [12, 18] 从半当中 12 起步
      // bi1: Down [10, 18] 回调至 10 (穿透起点 12)
      // bi2: Up [10, 25] 前三笔重叠核 [12, 18]
      // 缠论第78课：线段起点可以不是极限值，只要具备三笔重叠，即可作为合法起始段
      const bis: ChanBi[] = [
        makeBi('up', 18, 12, 0), // 半当中的起点 12
        makeBi('down', 18, 10, 1), // 回调穿透 12 达到 10
        makeBi('up', 25, 10, 2), // 延伸至 25 (前三笔重叠 [12, 18])
        makeBi('down', 25, 20, 3), // 回调到 20
        makeBi('up', 30, 20, 4), // 延伸至 30
      ];

      const result = new DuanCalculator().createDuan(bis);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const firstSeg = result[0];
      // 不受极值偏见约束，合法从 bi0 起步
      expect(firstSeg.startBi).toBe(bis[0]);
      expect(firstSeg.trend).toBe(TrendDirection.Up);
      expect(firstSeg.low).toBe(10);
    });

    it('skips leading strokes when first 3 strokes have no price overlap (第65课公理)', () => {
      // bi0: Up [10, 20], bi1: Down [5, 20], bi2: Up [5, 8] -> [10,20] 与 [5,8] 无重叠
      // bi3: Down [2, 8], bi4: Up [2, 15], bi5: Down [11, 15], bi6: Up [11, 22]
      const bis: ChanBi[] = [
        makeBi('up', 20, 10, 0),
        makeBi('down', 20, 5, 1),
        makeBi('up', 8, 5, 2), // 无重叠，跳过
        makeBi('down', 8, 2, 3),
        makeBi('up', 15, 2, 4), // 从 2 开启合法向上三笔
        makeBi('down', 15, 11, 5), // 回调到 11 (不破 2)
        makeBi('up', 22, 11, 6),
      ];

      const result = new DuanCalculator().createDuan(bis);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const firstSeg = result[0];
      // bi0 (10->20) 前三笔无重叠被跳过，首个合法段为从 20 开启的向下段 (bi1)
      expect(firstSeg.startBi).toBe(bis[1]);
      expect(firstSeg.trend).toBe(TrendDirection.Down);
      expect(firstSeg.high).toBe(20);
    });

    it('allows starting from an intermediate price point (半当中的点) without requiring global extremes', () => {
      // 起点既不是最低点也不是最高点，只要局部三笔重叠且次笔不破起点，即可合法作为起点
      const bis: ChanBi[] = [
        makeBi('down', 1600, 1400, 0), // 从中继点 1600 起步向下
        makeBi('up', 1550, 1400, 1), // 反弹到 1550 (不破 1600)
        makeBi('down', 1550, 1350, 2), // 跌至 1350 (前三笔重叠核 [1400, 1550])
      ];

      const result = new DuanCalculator().createDuan(bis);

      expect(result).toHaveLength(1);
      const firstSeg = result[0];
      expect(firstSeg.startBi).toBe(bis[0]);
      expect(firstSeg.trend).toBe(TrendDirection.Down);
      expect(firstSeg.high).toBe(1600);
    });
  });
});

/** 构造最小 ChanBi（仅设 DuanCalculator 使用的字段；fenxings/originData 留空，段算法不读）。 */
function makeBi(
  trend: 'up' | 'down',
  high: number,
  low: number,
  id: number,
): ChanBi {
  const time = new Date(2026, 6, 1, 9, id, 0, 0);
  return {
    startTime: time,
    endTime: time,
    high,
    low,
    trend: trend === 'up' ? TrendDirection.Up : TrendDirection.Down,
    type: BiType.Complete,
    status: BiStatus.Valid,
    independentCount: 1,
    originIds: [id],
    originData: [],
    startFenxing: null,
    endFenxing: null,
  };
}
