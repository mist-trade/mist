import { ChanBspType, ChanDivergenceType, TrendDirection } from '../contracts';
import type {
  ChanBspInput,
  ChanBspUnit,
  ChanBuySellPoint,
  ChanDivergenceInput,
  ChanDivergenceZhongshu,
} from '../contracts';
import { DivergenceDetector } from './divergence';

/** 中枢在 units 中的定位结果（供三类判定）。 */
interface BspChannelSpan {
  readonly zhongshuIndex: number;
  readonly firstIndex: number; // 中枢首单元下标（= s）
  readonly lastIndex: number; // 中枢末单元下标（= e）
  readonly zg: number;
  readonly zd: number;
}

const SIDE_ORDER: Record<ChanBspType, number> = {
  [ChanBspType.FirstBuy]: 0,
  [ChanBspType.FirstSell]: 1,
  [ChanBspType.SecondBuy]: 2,
  [ChanBspType.SecondSell]: 3,
  [ChanBspType.ThirdBuy]: 4,
  [ChanBspType.ThirdSell]: 5,
};

/**
 * 买卖点判定（缠论第20/21课）—— 无状态、无 I/O 共享纯函数，笔级/段级复用。
 * 一类 = 趋势背驰点（内部消费 DivergenceDetector 的 Trend 结果，盘整背驰过滤）；
 * 二类 = 一买/一卖后的次级别回抽确认（相邻三元组 + 前置一类点，纯结构，不查背驰）；
 * 三类 = 离开中枢后回抽不回中枢区间（几何，严格口径：贴边触及 = 回到中枢，不算）。
 */
export class BuySellPointDetector {
  /**
   * 入参 = 最小结构接口（units 笔/段序列含 high/low、zhongshus 中枢序列、forces 力度）。
   * forces 为空数组 → 一类不输出；二三类照常。返回按 unitIndex → type → zhongshuIndex 排序。
   */
  detectBuySellPoints(input: ChanBspInput): ChanBuySellPoint[] {
    if (input.units.length === 0) {
      return [];
    }
    const points: ChanBuySellPoint[] = [];
    const divInput: ChanDivergenceInput = {
      units: input.units,
      zhongshus: input.zhongshus,
      forces: input.forces,
    };
    const divergences = new DivergenceDetector().detectDivergences(divInput);

    this.detectFirst(input, divergences, points);
    this.detectSecond(input, divergences, points);
    this.detectThird(input, points);
    points.sort((a, b) => this.comparePoints(a, b));
    this.fillFirstTypeIndex(points);
    return points;
  }

  /**
   * 一类买卖点：消费背驰（趋势背驰 Trend 或 中枢离开段盘整背驰 Consolidation）。
   * 缠论第 24 课原典：背驰是最重要的转折点；第 29 课原典：中枢离开段发生背驰（盘整背驰），
   * 同样构成该级别的转折买卖点。单中枢离开段底背驰即为一买，顶背驰即为一卖。
   */
  private detectFirst(
    input: ChanBspInput,
    divergences: readonly import('../contracts').ChanDivergence[],
    out: ChanBuySellPoint[],
  ): void {
    const { units } = input;
    const seenLeaves = new Set<number>();

    // 优先消费趋势背驰（Trend），再补充盘整背驰（Consolidation）
    const sortedDivs = [...divergences].sort((a, b) => {
      if (
        a.type === ChanDivergenceType.Trend &&
        b.type !== ChanDivergenceType.Trend
      )
        return -1;
      if (
        a.type !== ChanDivergenceType.Trend &&
        b.type === ChanDivergenceType.Trend
      )
        return 1;
      return a.zhongshuIndex - b.zhongshuIndex;
    });

    for (const div of sortedDivs) {
      if (seenLeaves.has(div.leaveIndex)) {
        continue;
      }
      const leaveTrend = units[div.leaveIndex].trend;
      if (leaveTrend === TrendDirection.None) {
        continue;
      }
      const isBuy = leaveTrend === TrendDirection.Down;

      const leaveUnit = units[div.leaveIndex];
      const enterUnit = units[div.enterIndex];
      const zhongshu = input.zhongshus[div.zhongshuIndex];

      // 核心形态学门禁：背驰必须切实创出新极值（价格创新极值与动能衰竭相背离）
      if (isBuy) {
        // 底背驰（一买）：离开段最低价必须跌破进入段最低价，且跌破中枢下轨
        if (leaveUnit.low >= enterUnit.low) {
          continue;
        }
        if (zhongshu && leaveUnit.low >= zhongshu.zd) {
          continue;
        }
      } else {
        // 顶背驰（一卖）：离开段最高价必须突破进入段最高价，且突破中枢上轨
        if (leaveUnit.high <= enterUnit.high) {
          continue;
        }
        if (zhongshu && leaveUnit.high <= zhongshu.zg) {
          continue;
        }
      }

      seenLeaves.add(div.leaveIndex);
      out.push({
        type: isBuy ? ChanBspType.FirstBuy : ChanBspType.FirstSell,
        zhongshuIndex: div.zhongshuIndex,
        unitIndex: div.leaveIndex,
        price: isBuy ? leaveUnit.low : leaveUnit.high,
        firstTypeIndex: null,
      });
    }
  }

  /**
   * 二类：相邻三元组 + 前置一类点/中枢盘背点确认，不查背驰/力度。
   * 缠论 20/21/29 课：一买之后或中枢盘整背驰之后的次级别回抽不破前低构成二买。
   */
  private detectSecond(
    input: ChanBspInput,
    divergences: readonly import('../contracts').ChanDivergence[],
    out: ChanBuySellPoint[],
  ): void {
    const { units } = input;
    const firstBuyUnits = new Set<number>();
    const firstSellUnits = new Set<number>();

    // 1. 前置一买/一卖确认
    for (const p of out) {
      if (p.type === ChanBspType.FirstBuy) {
        firstBuyUnits.add(p.unitIndex);
      } else if (p.type === ChanBspType.FirstSell) {
        firstSellUnits.add(p.unitIndex);
      }
    }

    // 2. 中枢盘整背驰点确认（29课："中枢盘整的买卖点归二类"）
    for (const div of divergences) {
      if (div.type === ChanDivergenceType.Consolidation) {
        const trend = units[div.leaveIndex].trend;
        if (trend === TrendDirection.Down) {
          firstBuyUnits.add(div.leaveIndex);
        } else if (trend === TrendDirection.Up) {
          firstSellUnits.add(div.leaveIndex);
        }
      }
    }

    for (let i = 0; i + 2 < units.length; i++) {
      const a = units[i];
      const b = units[i + 1];
      const c = units[i + 2];
      if (
        firstBuyUnits.has(i) &&
        a.trend === TrendDirection.Down &&
        b.trend === TrendDirection.Up &&
        c.trend === TrendDirection.Down &&
        c.low > a.low
      ) {
        out.push({
          type: ChanBspType.SecondBuy,
          zhongshuIndex: null,
          unitIndex: i + 2,
          price: c.low,
          firstTypeIndex: null,
        });
      } else if (
        firstSellUnits.has(i) &&
        a.trend === TrendDirection.Up &&
        b.trend === TrendDirection.Down &&
        c.trend === TrendDirection.Up &&
        c.high < a.high
      ) {
        out.push({
          type: ChanBspType.SecondSell,
          zhongshuIndex: null,
          unitIndex: i + 2,
          price: c.high,
          firstTypeIndex: null,
        });
      }
    }
  }

  /** 三类：中枢离开段（e+1）后相邻回抽段（e+2），回抽段不回中枢区间（严格）。 */
  private detectThird(input: ChanBspInput, out: ChanBuySellPoint[]): void {
    const { units, zhongshus } = input;
    for (const span of this.locateSpans(units, zhongshus)) {
      const leave = span.lastIndex + 1;
      const pull = leave + 1;
      if (leave >= units.length || pull >= units.length) {
        continue; // 无离开段或无回抽段，跳过
      }
      const L = units[leave];
      const P = units[pull];
      if (
        L.trend === TrendDirection.Up &&
        P.trend === TrendDirection.Down &&
        P.low > span.zg
      ) {
        out.push({
          type: ChanBspType.ThirdBuy,
          zhongshuIndex: span.zhongshuIndex,
          unitIndex: pull,
          price: P.low,
          firstTypeIndex: null,
        });
      } else if (
        L.trend === TrendDirection.Down &&
        P.trend === TrendDirection.Up &&
        P.high < span.zd
      ) {
        out.push({
          type: ChanBspType.ThirdSell,
          zhongshuIndex: span.zhongshuIndex,
          unitIndex: pull,
          price: P.high,
          firstTypeIndex: null,
        });
      }
    }
  }

  /** 中枢定位（与背驰 locateSpans 同法）：按 firstUnitTime/lastUnitTime 精确匹配，失败跳过。 */
  private locateSpans(
    units: readonly ChanBspUnit[],
    zhongshus: readonly ChanDivergenceZhongshu[],
  ): BspChannelSpan[] {
    const spans: BspChannelSpan[] = [];
    for (let z = 0; z < zhongshus.length; z++) {
      const zhongshu = zhongshus[z];
      const s = this.indexOfUnitStart(units, zhongshu.firstUnitTime);
      const e = this.indexOfUnitEnd(units, zhongshu.lastUnitTime);
      if (s === -1 || e === -1 || e < s) {
        continue; // 定位失败，跳过该中枢（不臆断）
      }
      spans.push({
        zhongshuIndex: z,
        firstIndex: s,
        lastIndex: e,
        zg: zhongshu.zg,
        zd: zhongshu.zd,
      });
    }
    return spans;
  }

  private indexOfUnitStart(
    units: readonly ChanBspUnit[],
    target: Date,
  ): number {
    for (let i = 0; i < units.length; i++) {
      if (units[i].startTime.getTime() === target.getTime()) {
        return i;
      }
    }
    return -1;
  }

  private indexOfUnitEnd(units: readonly ChanBspUnit[], target: Date): number {
    for (let i = 0; i < units.length; i++) {
      if (units[i].endTime.getTime() === target.getTime()) {
        return i;
      }
    }
    return -1;
  }

  private comparePoints(a: ChanBuySellPoint, b: ChanBuySellPoint): number {
    if (a.unitIndex !== b.unitIndex) {
      return a.unitIndex - b.unitIndex;
    }
    const typeDiff = SIDE_ORDER[a.type] - SIDE_ORDER[b.type];
    if (typeDiff !== 0) {
      return typeDiff;
    }
    const ai =
      a.zhongshuIndex === null ? Number.MAX_SAFE_INTEGER : a.zhongshuIndex;
    const bi =
      b.zhongshuIndex === null ? Number.MAX_SAFE_INTEGER : b.zhongshuIndex;
    return ai - bi;
  }

  /** 排序后回填：每个二/三类点在同类（buy/sell）一类点中找 unitIndex 最大的前置者。 */
  private fillFirstTypeIndex(points: ChanBuySellPoint[]): void {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.type === ChanBspType.FirstBuy || p.type === ChanBspType.FirstSell) {
        continue;
      }
      const wantBuy =
        p.type === ChanBspType.SecondBuy || p.type === ChanBspType.ThirdBuy;
      let best: ChanBuySellPoint | null = null;
      for (const q of points) {
        if (
          q.type !== ChanBspType.FirstBuy &&
          q.type !== ChanBspType.FirstSell
        ) {
          continue;
        }
        if ((q.type === ChanBspType.FirstBuy) !== wantBuy) {
          continue;
        }
        if (q.unitIndex >= p.unitIndex) {
          continue;
        }
        if (best === null || q.unitIndex > best.unitIndex) {
          best = q;
        }
      }
      points[i] = {
        ...p,
        firstTypeIndex: best === null ? null : points.indexOf(best),
      };
    }
  }
}
