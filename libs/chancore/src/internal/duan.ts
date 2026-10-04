import { DuanStatus, DuanType, TrendDirection } from '../contracts';
import type { ChanBi, ChanDuan } from '../contracts';
import { ChanInvariantError } from '../errors';
import { collectBiRangeStats } from './duan-range';
import { hasTruePhysicalGap, mergePriceInterval } from './interval-inclusion';
import { isBottomExtremum, isTopExtremum } from './fenxing-extreme';

/**
 * 段（线段）划分 —— 缠中说禅第67课「特征序列法」+ 第71课「再分辨」+ 第78/81课「堆栈规约状态机」。
 *
 * 核心架构准则：
 * 1. 第65课线段公理：前三笔必须有价格重叠区间（ZD <= ZG），起点不预设极值，终点不设极限值；
 * 2. 第67/71课特征序列：向上段取向下笔，向下段取向上笔；转折点前最后一元素（第一元素）与从转折点
 *    开始的第一笔（第二元素）严禁跨界合并包含（第71课隔离律）；
 * 3. 第78/81课反向成段最高公理与第二特征序列：
 *    - 出现缺口（第二种情况）或单笔见极值（第71课第一笔破坏）时，由反向走势独立成段破坏前段；
 *    - 第二特征序列方向与原线段一致，若形成分型（第81课 5 > 7 形成顶分型）则倒推确认；若 5 <= 7 包含合并无分型则保持1段。
 */

/** 特征序列元素：一根反向笔视为一根"准K线"。 */
interface FeatureElement {
  readonly high: number;
  readonly low: number;
  readonly biIndex: number;
}

interface SegmentEnd {
  readonly endIdx: number;
  readonly nextStart: number;
}

export class DuanCalculator {
  /**
   * 入参 = `createBi` 返回值的 `phaseB`（`ChanBi[]`，最终笔数组）——段算法只消费最终笔，
   * 不需要两阶段 envelope。返回确认后的段序列（单数组，无 phaseA）。
   */
  createDuan(bis: readonly ChanBi[]): ChanDuan[] {
    if (bis.length < 3) {
      return [];
    }
    const startIdx = this.findValidSegmentStart(bis);
    if (startIdx > bis.length - 3) {
      return [];
    }
    return this.segment(bis, startIdx);
  }

  /**
   * 寻找首个具备合法线段起步结构的起始笔（同构于笔算法寻找首个分型）。
   *
   * 核心准则（严格局部几何判定，不预设全局极值，完全遵循第65/78课）：
   * 1. 缠论第65课线段公理：前三笔必须有价格重叠区间（zd <= zg），若无重叠则跳过前置杂波/未定型笔；
   * 2. 起点可以是最高点、最低点，也可以是前序走势转折时的中间震荡点（半当中的点，第78课）；
   * 3. 终点由特征序列分型状态机驱动，不作任何人为极限值限制。
   */
  private findValidSegmentStart(bis: readonly ChanBi[]): number {
    for (let i = 0; i <= bis.length - 3; i++) {
      const b0 = bis[i];
      const b1 = bis[i + 1];
      const b2 = bis[i + 2];

      const zd = Math.max(
        Math.min(b0.high, b0.low),
        Math.min(b1.high, b1.low),
        Math.min(b2.high, b2.low),
      );
      const zg = Math.min(
        Math.max(b0.high, b0.low),
        Math.max(b1.high, b1.low),
        Math.max(b2.high, b2.low),
      );
      if (zd <= zg) {
        return i; // 找到首个具备三笔重叠核的合法起点
      }
    }

    return bis.length;
  }

  /** 切分整条笔序列为确认后的段序列（case-1 直接确认 + case-2 倒推确认），从 startIdx 起。 */
  private segment(bis: readonly ChanBi[], startIdx: number): ChanDuan[] {
    const out: ChanDuan[] = [];
    while (startIdx < bis.length) {
      const end = this.findSegmentEnd(bis, startIdx, false);
      if (end === null) {
        out.push(
          this.buildDuan(
            bis,
            startIdx,
            bis.length - 1,
            DuanType.UnComplete,
            DuanStatus.Unknown,
          ),
        );
        break;
      }
      out.push(
        this.buildDuan(
          bis,
          startIdx,
          end.endIdx,
          DuanType.Complete,
          DuanStatus.Valid,
        ),
      );
      startIdx = end.nextStart;
    }
    return out;
  }

  /**
   * 从 segStartIdx 起寻找线段终止点（缠论第 67/71/78/81 课堆栈规约状态机）。
   */
  private findSegmentEnd(
    bis: readonly ChanBi[],
    segStartIdx: number,
    isSubSegment = false,
  ): SegmentEnd | null {
    const direction = bis[segStartIdx].trend;
    let stdSeq: FeatureElement[] = [];
    let prev: FeatureElement | null = null;

    for (let i = segStartIdx; i < bis.length; i++) {
      if (bis[i].trend === direction) {
        continue;
      }

      const rev: FeatureElement = {
        high: bis[i].high,
        low: bis[i].low,
        biIndex: i,
      };

      if (prev !== null) {
        const first = stdSeq.length > 0 ? stdSeq[stdSeq.length - 1] : null;
        const candidateEndIdx = prev.biIndex - 1;

        if (
          first !== null &&
          this.isDirectionalFenxing(first, prev, rev, direction)
        ) {
          if (candidateEndIdx >= segStartIdx + 2) {
            const extremumPrice =
              direction === TrendDirection.Down
                ? bis[candidateEndIdx].low
                : bis[candidateEndIdx].high;
            const nextSameDirBi = bis[prev.biIndex + 1];
            const immediateBreak =
              nextSameDirBi &&
              (direction === TrendDirection.Up
                ? nextSameDirBi.high > extremumPrice
                : nextSameDirBi.low < extremumPrice);

            if (!immediateBreak) {
              if (!this.hasGap(bis, first, prev)) {
                return { endIdx: candidateEndIdx, nextStart: prev.biIndex };
              }
              if (
                this.isReverseMovementConfirmed(
                  bis,
                  prev.biIndex,
                  direction,
                  extremumPrice,
                  true,
                )
              ) {
                return { endIdx: candidateEndIdx, nextStart: prev.biIndex };
              }
            }
          }
        } else if (first === null && !isSubSegment) {
          // 单笔转折点 (如 3674.41 或 81课单笔)：必须由严格独立反向线段破坏 (isStandardSegment = false)
          const extremumPrice =
            direction === TrendDirection.Down
              ? bis[candidateEndIdx].low
              : bis[candidateEndIdx].high;
          if (
            this.isReverseMovementConfirmed(
              bis,
              prev.biIndex,
              direction,
              extremumPrice,
              false,
            )
          ) {
            return { endIdx: candidateEndIdx, nextStart: prev.biIndex };
          }
        }

        stdSeq = this.mergeFeatureInclusion(stdSeq, prev, direction);
      }
      prev = rev;
    }
    return null;
  }

  /**
   * 检验反向走势是否确立成段并破坏前线段（缠论第 67/78/81 课反向成段倒推规约公理）：
   * 1. 对于单笔转折点（如 3674.41）：反向必须独立走完一条完整的已确认线段且破位（如 3674.41 -> 3040.69，9笔下行成段，破第一笔低点）；
   * 2. 对于第二特征序列（Lesson 67/78/81）：同向三元素特征序列形成分型（原向上段需出顶分型，原向下段需出底分型；标准段出任意分型亦可确认）。
   */
  private isReverseMovementConfirmed(
    bis: readonly ChanBi[],
    reverseStart: number,
    originalDir: TrendDirection,
    extremumPrice: number,
    isStandardSegment: boolean,
  ): boolean {
    if (reverseStart >= bis.length) return false;

    // 1. 若是单笔转折点（如 3674.41）：反向必须独立走完一条完整的已确认线段且破位（如 3674.41 -> 3040.69，9笔下行成段，破第一笔低点）
    if (!isStandardSegment) {
      const subEnd = this.findSegmentEnd(bis, reverseStart, true);
      if (subEnd !== null && subEnd.endIdx >= reverseStart + 2) {
        let brokeExtremum = false;
        let brokeFirstBi = false;
        const firstBiEnd =
          originalDir === TrendDirection.Up
            ? bis[reverseStart].low
            : bis[reverseStart].high;

        for (let j = reverseStart; j <= subEnd.endIdx; j++) {
          if (originalDir === TrendDirection.Up) {
            if (bis[j].high > extremumPrice) {
              brokeExtremum = true;
              break;
            }
            if (
              bis[j].trend === TrendDirection.Down &&
              bis[j].low < firstBiEnd
            ) {
              brokeFirstBi = true;
            }
          } else {
            if (bis[j].low < extremumPrice) {
              brokeExtremum = true;
              break;
            }
            if (
              bis[j].trend === TrendDirection.Up &&
              bis[j].high > firstBiEnd
            ) {
              brokeFirstBi = true;
            }
          }
        }

        if (!brokeExtremum && brokeFirstBi) {
          let expandingCounter = false;
          if (originalDir === TrendDirection.Up) {
            if (reverseStart + 5 < bis.length) {
              const bounce1 = bis[reverseStart + 1];
              const bounce2 = bis[reverseStart + 3];
              const bounce3 = bis[reverseStart + 5];
              if (
                bounce1 &&
                bounce2 &&
                bounce3 &&
                bounce2.high > bounce1.high &&
                bounce3.high >= bounce2.high
              ) {
                expandingCounter = true;
              }
            }
          } else {
            if (reverseStart + 5 < bis.length) {
              const bounce1 = bis[reverseStart + 1];
              const bounce2 = bis[reverseStart + 3];
              const bounce3 = bis[reverseStart + 5];
              if (
                bounce1 &&
                bounce2 &&
                bounce3 &&
                bounce2.low < bounce1.low &&
                bounce3.low <= bounce2.low
              ) {
                expandingCounter = true;
              }
            }
          }

          if (!expandingCounter) {
            return true;
          }
        }
      }
    }

    // 2. 检查 Lesson 67/78/81 第二特征序列分型
    const reverseDir = bis[reverseStart].trend;
    let secondSeq: FeatureElement[] = [];
    let prevS: FeatureElement | null = null;

    for (let i = reverseStart; i < bis.length; i++) {
      const bi = bis[i];
      if (bi.trend === reverseDir) {
        if (originalDir === TrendDirection.Up && bi.high > extremumPrice)
          return false;
        if (originalDir === TrendDirection.Down && bi.low < extremumPrice)
          return false;
        continue;
      }

      const revS: FeatureElement = { high: bi.high, low: bi.low, biIndex: i };
      if (prevS !== null) {
        const firstS =
          secondSeq.length > 0 ? secondSeq[secondSeq.length - 1] : null;
        if (firstS !== null) {
          // 注意：若为已成段的标准段(isStandardSegment)，根据第67课原典：反向特征序列出任意分型(含底分型)即确认！
          // 若为单笔见顶(isStandardSegment=false)，根据第78/81课：必须严格同向分型(Up->Top, Down->Bottom)！
          const confirmed = isStandardSegment
            ? this.hasAnyFenxing(firstS, prevS, revS)
            : this.isSecondFeatureFenxing(firstS, prevS, revS, originalDir);
          if (confirmed) {
            return true;
          }
        }
        secondSeq = this.mergeFeatureInclusion(secondSeq, prevS, originalDir);
      }

      if (originalDir === TrendDirection.Up && bi.high > extremumPrice)
        return false;
      if (originalDir === TrendDirection.Down && bi.low < extremumPrice)
        return false;

      prevS = revS;
    }

    return false;
  }

  /** 67课第二特征序列分型判定: 任意分型(顶分型或底分型)均可。复用通用极值算子。 */
  private hasAnyFenxing(
    first: FeatureElement,
    second: FeatureElement,
    third: FeatureElement,
  ): boolean {
    return (
      isTopExtremum(first, second, third) ||
      isBottomExtremum(first, second, third)
    );
  }

  /** 缠论第 78/81 课第二特征序列分型：原向上段破坏需出顶分型；原向下段破坏需出底分型。 */
  private isSecondFeatureFenxing(
    first: FeatureElement,
    second: FeatureElement,
    third: FeatureElement,
    originalDir: TrendDirection,
  ): boolean {
    if (originalDir === TrendDirection.Up) {
      return isTopExtremum(first, second, third);
    }
    return isBottomExtremum(first, second, third);
  }

  /**
   * 第71课边界分型判定：
   * - 向下段（特征序列=向上笔）：底分型 = 第二元素低点最低。
   * - 向上段（特征序列=向下笔）：顶分型 = 第二元素高点最高。
   */
  private isDirectionalFenxing(
    first: FeatureElement,
    second: FeatureElement,
    third: FeatureElement,
    direction: TrendDirection,
  ): boolean {
    if (direction === TrendDirection.Down) {
      return isBottomExtremum(first, second, third);
    }
    return isTopExtremum(first, second, third);
  }

  /**
   * 特征序列包含处理：复用通用区间包含合并算子 mergePriceInterval。
   */
  private mergeFeatureInclusion(
    seq: FeatureElement[],
    next: FeatureElement,
    direction: TrendDirection,
  ): FeatureElement[] {
    if (seq.length === 0) {
      return [next];
    }
    const last = seq[seq.length - 1];
    const res = mergePriceInterval(last, next, direction);
    if (res.merged) {
      const merged: FeatureElement = {
        high: res.newHigh,
        low: res.newLow,
        biIndex: next.biIndex,
      };
      return [...seq.slice(0, -1), merged];
    }
    return [...seq, next];
  }

  /**
   * 缺口判定：穿透检查原始 K 线物理价格真空（下穿 originData），防止折线平滑掩盖真实跳空。
   */
  private hasGap(
    bis: readonly ChanBi[],
    a: FeatureElement,
    b: FeatureElement,
  ): boolean {
    const biA = bis[a.biIndex];
    const biB = bis[b.biIndex];
    if (biA && biB) {
      return hasTruePhysicalGap(biA, biB);
    }
    return a.high < b.low || b.high < a.low;
  }

  /** 由 bis[startIdx..endIdx] 构建 ChanDuan。 */
  private buildDuan(
    bis: readonly ChanBi[],
    startIdx: number,
    endIdx: number,
    type: DuanType,
    status: DuanStatus,
  ): ChanDuan {
    if (startIdx > endIdx || endIdx >= bis.length) {
      throw new ChanInvariantError(
        `Duan build invariant failed: invalid range [${startIdx}..${endIdx}] for bis length ${bis.length}`,
      );
    }
    const segmentBis = bis.slice(startIdx, endIdx + 1);
    if (segmentBis.length === 0) {
      throw new ChanInvariantError(
        `Duan build invariant failed: empty segment [${startIdx}..${endIdx}]`,
      );
    }
    const stats = collectBiRangeStats(segmentBis);
    const startBi = segmentBis[0];
    const endBi = segmentBis[segmentBis.length - 1];
    return {
      startTime: new Date(startBi.startTime.getTime()),
      endTime: new Date(endBi.endTime.getTime()),
      high: stats.high,
      low: stats.low,
      trend: startBi.trend,
      type,
      status,
      independentCount: stats.independentCount,
      originIds: stats.originIds,
      originBis: [...segmentBis],
      startBi,
      endBi: type === DuanType.Complete ? endBi : null,
    };
  }
}
