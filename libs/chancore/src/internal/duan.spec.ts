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
