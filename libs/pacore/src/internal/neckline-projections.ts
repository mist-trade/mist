import {
  NecklineBreakoutInfo,
  NecklineOptions,
  NecklinePatternType,
  NecklineProjection,
  NecklineProjectionTargets,
  NecklineRetestZone,
  NecklineStatus,
  PaK,
  PaPivotPoint,
} from '../contracts';

export class NecklineProjectionEngine {
  /**
   * 全量扫描检测 K 线序列中的颈线映射与空间投射 (Neckline Projections)
   */
  public static findProjections(
    bars: readonly PaK[],
    options: NecklineOptions = {},
  ): readonly NecklineProjection[] {
    const minSpan = options.minBarSpan ?? 4;
    if (!bars || bars.length < minSpan) {
      return [];
    }

    const swingWindow = options.swingWindow ?? 2;
    const maxTroughDiff = options.maxTroughDifferenceRatio ?? 0.05;
    const minHeightRatio = options.minPatternHeightRatio ?? 0.01;
    const maxSpan = options.maxBarSpan ?? 120;

    // 1. 提取 Swing 摆动极值点时序
    const pivots = this.extractSwingPivots(bars, swingWindow);
    if (pivots.length < 3) {
      return [];
    }

    const results: NecklineProjection[] = [];

    // 2. 拓扑扫描：双底 (Double Bottom) 与 双顶 (Double Top) - 3 点拓扑
    for (let i = 0; i <= pivots.length - 3; i++) {
      const p1 = pivots[i];
      const p2 = pivots[i + 1];
      const p3 = pivots[i + 2];

      const barSpan = p3.index - p1.index;
      if (barSpan < minSpan || barSpan > maxSpan) continue;

      // (1) 看涨双底: Low1 -> High(Neckline) -> Low2
      if (p1.type === 'low' && p2.type === 'high' && p3.type === 'low') {
        const avgLow = (p1.price + p3.price) / 2;
        const diffRatio = Math.abs(p1.price - p3.price) / avgLow;
        const extremumPrice = Math.min(p1.price, p3.price);
        const height = p2.price - extremumPrice;

        if (
          diffRatio <= maxTroughDiff &&
          height > 0 &&
          height / avgLow >= minHeightRatio
        ) {
          const projection = this.buildProjection(
            bars,
            NecklinePatternType.DoubleBottom,
            'up',
            [p1, p2, p3],
            p2.price,
            extremumPrice,
            height,
          );
          results.push(projection);
        }
      }

      // (2) 看跌双顶: High1 -> Low(Neckline) -> High2
      if (p1.type === 'high' && p2.type === 'low' && p3.type === 'high') {
        const avgHigh = (p1.price + p3.price) / 2;
        const diffRatio = Math.abs(p1.price - p3.price) / avgHigh;
        const extremumPrice = Math.max(p1.price, p3.price);
        const height = extremumPrice - p2.price;

        if (
          diffRatio <= maxTroughDiff &&
          height > 0 &&
          height / avgHigh >= minHeightRatio
        ) {
          const projection = this.buildProjection(
            bars,
            NecklinePatternType.DoubleTop,
            'down',
            [p1, p2, p3],
            p2.price,
            extremumPrice,
            height,
          );
          results.push(projection);
        }
      }
    }

    // 3. 拓扑扫描：头肩底与头肩顶 - 5 点拓扑
    for (let i = 0; i <= pivots.length - 5; i++) {
      const p1 = pivots[i];
      const p2 = pivots[i + 1];
      const p3 = pivots[i + 2];
      const p4 = pivots[i + 3];
      const p5 = pivots[i + 4];

      const barSpan = p5.index - p1.index;
      if (barSpan < minSpan || barSpan > maxSpan) continue;

      // 倒头肩 / 头肩底: Low(Left) -> High(Neck1) -> Low(Head) -> High(Neck2) -> Low(Right)
      if (
        p1.type === 'low' &&
        p2.type === 'high' &&
        p3.type === 'low' &&
        p4.type === 'high' &&
        p5.type === 'low' &&
        p3.price < Math.min(p1.price, p5.price)
      ) {
        const necklinePrice = (p2.price + p4.price) / 2;
        const extremumPrice = p3.price;
        const height = necklinePrice - extremumPrice;

        if (height > 0 && height / extremumPrice >= minHeightRatio) {
          const projection = this.buildProjection(
            bars,
            NecklinePatternType.HeadAndShouldersBottom,
            'up',
            [p1, p2, p3, p4, p5],
            necklinePrice,
            extremumPrice,
            height,
          );
          results.push(projection);
        }
      }

      // 头肩顶: High(Left) -> Low(Neck1) -> High(Head) -> Low(Neck2) -> High(Right)
      if (
        p1.type === 'high' &&
        p2.type === 'low' &&
        p3.type === 'high' &&
        p4.type === 'low' &&
        p5.type === 'high' &&
        p3.price > Math.max(p1.price, p5.price)
      ) {
        const necklinePrice = (p2.price + p4.price) / 2;
        const extremumPrice = p3.price;
        const height = extremumPrice - necklinePrice;

        if (height > 0 && height / necklinePrice >= minHeightRatio) {
          const projection = this.buildProjection(
            bars,
            NecklinePatternType.HeadAndShouldersTop,
            'down',
            [p1, p2, p3, p4, p5],
            necklinePrice,
            extremumPrice,
            height,
          );
          results.push(projection);
        }
      }
    }

    return results;
  }

  /**
   * 提取交替摆动极值点 (Swing Pivots)
   */
  private static extractSwingPivots(
    bars: readonly PaK[],
    window: number,
  ): PaPivotPoint[] {
    const rawPivots: PaPivotPoint[] = [];

    for (let i = window; i < bars.length - window; i++) {
      const current = bars[i];
      let isHigh = true;
      let isLow = true;

      for (let j = i - window; j <= i + window; j++) {
        if (j === i) continue;
        if (bars[j].high > current.high) isHigh = false;
        if (bars[j].high === current.high && j < i) isHigh = false;
        if (bars[j].low < current.low) isLow = false;
        if (bars[j].low === current.low && j < i) isLow = false;
      }

      if (isHigh) {
        rawPivots.push({
          index: i,
          time: current.time,
          price: current.high,
          type: 'high',
        });
      } else if (isLow) {
        rawPivots.push({
          index: i,
          time: current.time,
          price: current.low,
          type: 'low',
        });
      }
    }

    // 净化：相邻同向极值合并
    const alternating: PaPivotPoint[] = [];
    for (const p of rawPivots) {
      if (alternating.length === 0) {
        alternating.push(p);
        continue;
      }
      const last = alternating[alternating.length - 1];
      if (last.type === p.type) {
        if (
          (p.type === 'high' && p.price > last.price) ||
          (p.type === 'low' && p.price < last.price)
        ) {
          alternating[alternating.length - 1] = p;
        }
      } else {
        alternating.push(p);
      }
    }

    return alternating;
  }

  /**
   * 构建目标、敏感带并单向驱动状态机
   */
  private static buildProjection(
    bars: readonly PaK[],
    patternType: NecklinePatternType,
    direction: 'up' | 'down',
    pivots: PaPivotPoint[],
    necklinePrice: number,
    extremumPrice: number,
    baseHeight: number,
  ): NecklineProjection {
    const pStart = pivots[0];
    const pEnd = pivots[pivots.length - 1];

    // 计算测距目标
    const targets: NecklineProjectionTargets = {
      baseHeight,
      necklinePrice,
      target1_0:
        direction === 'up'
          ? necklinePrice + 1.0 * baseHeight
          : necklinePrice - 1.0 * baseHeight,
      target1_618:
        direction === 'up'
          ? necklinePrice + 1.618 * baseHeight
          : necklinePrice - 1.618 * baseHeight,
      target2_0:
        direction === 'up'
          ? necklinePrice + 2.0 * baseHeight
          : necklinePrice - 2.0 * baseHeight,
    };

    // 敏感带宽 0.5%
    const buffer = Math.max(necklinePrice * 0.005, baseHeight * 0.1);
    let retestZone: NecklineRetestZone = {
      top: necklinePrice + buffer,
      bottom: necklinePrice - buffer,
      isRetested: false,
    };

    let status: NecklineStatus = NecklineStatus.Forming;
    let breakout: NecklineBreakoutInfo | undefined;

    // 从形态结束点开始向后时序递推状态机
    for (let k = pEnd.index + 1; k < bars.length; k++) {
      const bar = bars[k];

      if (status === NecklineStatus.Forming) {
        if (direction === 'up') {
          if (bar.close > necklinePrice) {
            status = NecklineStatus.Breakout;
            breakout = {
              breakoutIndex: k,
              breakoutTime: bar.time,
              breakoutPrice: bar.close,
            };
          } else if (bar.close < extremumPrice) {
            status = NecklineStatus.Invalidated;
            break;
          }
        } else {
          if (bar.close < necklinePrice) {
            status = NecklineStatus.Breakout;
            breakout = {
              breakoutIndex: k,
              breakoutTime: bar.time,
              breakoutPrice: bar.close,
            };
          } else if (bar.close > extremumPrice) {
            status = NecklineStatus.Invalidated;
            break;
          }
        }
      } else if (status === NecklineStatus.Breakout) {
        // 1. 目标达成判定（若当根已达 1:1 目标位，即使盘中曾回探敏感带也不再退回 PullbackRetested）
        let reachedTarget = false;
        if (
          (direction === 'up' && bar.high >= targets.target1_0) ||
          (direction === 'down' && bar.low <= targets.target1_0)
        ) {
          status = NecklineStatus.TargetReached;
          reachedTarget = true;
        }

        // 2. 回抽支阻互换判定
        if (direction === 'up') {
          if (bar.low <= retestZone.top && bar.close >= retestZone.bottom) {
            if (!reachedTarget) {
              status = NecklineStatus.PullbackRetested;
            }
            retestZone = {
              ...retestZone,
              isRetested: true,
              retestIndex: k,
              retestTime: bar.time,
              retestExtreme: bar.low,
            };
          } else if (
            !reachedTarget &&
            bar.close < necklinePrice - 0.5 * baseHeight
          ) {
            status = NecklineStatus.Invalidated; // 假突破深幅破坏
            break;
          }
        } else {
          if (bar.high >= retestZone.bottom && bar.close <= retestZone.top) {
            if (!reachedTarget) {
              status = NecklineStatus.PullbackRetested;
            }
            retestZone = {
              ...retestZone,
              isRetested: true,
              retestIndex: k,
              retestTime: bar.time,
              retestExtreme: bar.high,
            };
          } else if (
            !reachedTarget &&
            bar.close > necklinePrice + 0.5 * baseHeight
          ) {
            status = NecklineStatus.Invalidated;
            break;
          }
        }
      } else if (status === NecklineStatus.PullbackRetested) {
        if (
          (direction === 'up' && bar.high >= targets.target1_0) ||
          (direction === 'down' && bar.low <= targets.target1_0)
        ) {
          status = NecklineStatus.TargetReached;
        } else if (
          (direction === 'up' && bar.close < extremumPrice) ||
          (direction === 'down' && bar.close > extremumPrice)
        ) {
          status = NecklineStatus.Invalidated;
          break;
        }
      }
    }

    const id = `neck_${patternType}_${pStart.time.getTime()}_${pEnd.time.getTime()}`;

    return {
      id,
      patternType,
      status,
      direction,
      pivots,
      startTime: pStart.time,
      startIndex: pStart.index,
      endTime: pEnd.time,
      endIndex: pEnd.index,
      necklinePrice,
      extremumPrice,
      targets,
      retestZone,
      breakout,
    };
  }
}
