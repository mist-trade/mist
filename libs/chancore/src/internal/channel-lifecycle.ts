import { TrendDirection } from '../contracts';
import { minMaxBy } from './min-max-by';

/**
 * 通用中枢几何构件元素契约（ChanBi 与 ChanDuan 的统一几何接口）
 */
export interface ChannelElement {
  readonly trend: TrendDirection;
  readonly high: number;
  readonly low: number;
  readonly originIds: readonly number[];
}

/**
 * 中枢核心几何参数
 */
export interface ChannelGeometry {
  zg: number;
  zd: number;
  gg: number;
  dd: number;
}

/**
 * 验证序列中各元素的趋势是否严格交替（Up 与 Down 交替）
 */
export function validateTrendAlternating<T extends { trend: TrendDirection }>(
  items: readonly T[],
): boolean {
  for (let i = 0; i < items.length - 1; i++) {
    if (items[i].trend === items[i + 1].trend) {
      return false;
    }
  }
  return true;
}

/**
 * 对称重叠几何参数计算（无方向区域计算）：
 * zg = min(高点), zd = max(低点), gg = max(高点), dd = min(低点)
 */
export function computeSymmetricGeometry<
  T extends { high: number; low: number },
>(items: readonly T[]): ChannelGeometry | null {
  if (items.length < 3) {
    return null;
  }
  const highMinMax = minMaxBy(items, (item) => item.high);
  const lowMinMax = minMaxBy(items, (item) => item.low);
  if (!highMinMax || !lowMinMax) {
    return null;
  }
  const zg = highMinMax.min;
  const zd = lowMinMax.max;
  const gg = highMinMax.max;
  const dd = lowMinMax.min;
  if (zg <= zd) {
    return null;
  }
  return { zg, zd, gg, dd };
}

/**
 * 计算中枢在原始序列中的首尾 ID 与居中展示锚点 ID
 */
export function resolveChannelAnchorIds<
  T extends { originIds: readonly number[] },
>(
  originalElements: readonly T[],
  startIndex: number,
  endIndex: number,
): {
  startId: number;
  endId: number;
  displayStartId: number;
  displayEndId: number;
} {
  const firstElem = originalElements[startIndex];
  const firstMidIdx = Math.floor(firstElem.originIds.length / 2);
  const displayStartId = firstElem.originIds[firstMidIdx];

  const lastElem = originalElements[endIndex];
  const lastMidIdx = Math.floor(lastElem.originIds.length / 2);
  const displayEndId = lastElem.originIds[lastMidIdx];

  return {
    startId: firstElem.originIds[0],
    endId: lastElem.originIds[lastElem.originIds.length - 1],
    displayStartId,
    displayEndId,
  };
}

/**
 * 中枢生命周期策略适配器：注入笔级与段级的特化核心识别与中枢组装
 */
export interface ChannelLifecycleStrategy<T extends ChannelElement, R> {
  /** 初始核心构件所需最小元素数（笔中枢为 4 笔：1进入+3构件；段中枢为 3 段：3构件） */
  readonly minCoreLength: number;
  /** 确认完成中枢的最小元素数门槛（笔中枢 >= 5；段中枢 >= 3） */
  readonly minSealedLength: number;
  /** 验证初始核心的几何与进入约束，返回核心几何参数与基准趋势方向 */
  validateCore(
    window: readonly T[],
  ): { geometry: ChannelGeometry; isUp: boolean } | null;
  /** 构建 Phase A 基础中枢 */
  buildPhaseAChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    coreGeometry: ChannelGeometry,
  ): R | null;
  /** 构建 Phase B 密封完成中枢或未完成中枢 */
  buildSealedChannel(
    elements: readonly T[],
    original: readonly T[],
    startIndex: number,
    geometry: ChannelGeometry,
    expanded: boolean,
    isComplete?: boolean,
  ): R;
}

/**
 * 检验顺势突破离开笔/段是否满足规则 1～4 封存条件（双向严格对称）
 */
function checkDepartureRules<T extends ChannelElement, R>(
  data: readonly T[],
  candidateIdx: number,
  isUp: boolean,
  curZg: number,
  curZd: number,
  newGg: number,
  newDd: number,
  strategy: ChannelLifecycleStrategy<T, R>,
): boolean {
  const count = data.length;
  // 若已至序列末尾，或下一笔未保持趋势交替，直接封存
  if (
    candidateIdx + 1 >= count ||
    data[candidateIdx + 1].trend === data[candidateIdx].trend
  ) {
    return true;
  }

  const pullback = data[candidateIdx + 1];
  const is3rdPoint = isUp ? pullback.low > curZg : pullback.high < curZd;

  if (is3rdPoint) {
    // 规则 1：第 3 类买卖点后顺势第 1 笔/段突破离开极值
    if (candidateIdx + 2 < count) {
      const stroke1 = data[candidateIdx + 2];
      const s1Exceeds = isUp ? stroke1.high > newGg : stroke1.low < newDd;
      if (s1Exceeds) {
        return true;
      }
    }

    // 规则 2：第 3 类买卖点后反向第 2 笔/段击穿中枢反向沿 (ZD/ZG)
    if (candidateIdx + 3 < count) {
      const stroke2 = data[candidateIdx + 3];
      const s2Pierces = isUp ? stroke2.low < curZd : stroke2.high > curZg;
      if (s2Pierces) {
        return true;
      }
    }
  } else {
    // 规则 3：无第 3 类买卖点，离开后反向折返直接打穿中枢反向沿 (ZD/ZG)
    const pbPierces = isUp ? pullback.low < curZd : pullback.high > curZg;
    if (pbPierces) {
      return true;
    }
  }

  // 规则 4：突破极值后，无论是否形成 3 类买卖点，若后续自身已构成新中枢核心，旧中枢封存
  const newCoreCandidate = data.slice(
    candidateIdx,
    candidateIdx + strategy.minCoreLength,
  );
  if (
    validateTrendAlternating(newCoreCandidate) &&
    strategy.validateCore(newCoreCandidate)
  ) {
    return true;
  }

  return false;
}

/**
 * 中枢生命周期引擎（Channel Lifecycle Engine）
 *
 * 统一驱动笔中枢与段中枢的生命周期推进：
 * 1. 核心确立：按策略识别初始构件并确立 [ZD, ZG]；
 * 2. 极值守卫：防止顺势突破穿越起点极值；
 * 3. 离开突破与规则 1～4 状态机封存（双向对称支持）：
 *    - 规则 1：3买/3卖 顺势突破 GG/DD 封存；
 *    - 规则 2：3买/3卖 逆势反转向下击穿 ZD（或向上击穿 ZG）封存；
 *    - 规则 3：无 3买/3卖，离开后单笔反向直接打穿 ZD/ZG 封存；
 *    - 规则 4：离开极值后，后续走势已独立构成合法新中枢核心，旧中枢在离开端点封存；
 * 4. 内部震荡成对触及延伸（维持动态公共重叠交集）；
 * 5. 序列末尾单元素触及保底吸纳。
 */
export class ChannelLifecycleEngine {
  static runSequentialLifecycle<T extends ChannelElement, R>(
    data: readonly T[],
    strategy: ChannelLifecycleStrategy<T, R>,
  ): { phaseA: R[]; sequential: R[] } {
    const phaseA: R[] = [];
    const sequential: R[] = [];
    const count = data.length;

    if (count < strategy.minCoreLength) {
      return { phaseA, sequential };
    }

    let cursor = 0;
    while (cursor <= count - strategy.minCoreLength) {
      // 1. 检验趋势交替与初始核心构件
      const candidateCore = data.slice(cursor, cursor + strategy.minCoreLength);
      if (!validateTrendAlternating(candidateCore)) {
        cursor++;
        continue;
      }

      const coreInfo = strategy.validateCore(candidateCore);
      if (!coreInfo) {
        cursor++;
        continue;
      }

      const { isUp } = coreInfo;
      let curZg = coreInfo.geometry.zg;
      let curZd = coreInfo.geometry.zd;
      let curGg = coreInfo.geometry.gg;
      let curDd = coreInfo.geometry.dd;

      const channelElements = [...candidateCore];
      let isExpanded = false;
      let hasSealedDeparture = false;
      let nextIdx = cursor + strategy.minCoreLength;

      // 2. 状态机推进：顺势离开突破（规则 1~4 封存）与触及震荡延伸
      while (nextIdx < count) {
        const curr = data[nextIdx];
        if (curr.trend === data[nextIdx - 1].trend) {
          break;
        }

        // 当 channelElements.length 为偶数时（如笔中枢 4, 6, 8...），curr 与进入笔同向
        if (channelElements.length % 2 === 0) {
          // 极值破坏守卫：顺势笔/段不得击穿向上起点 DD 或冲破向下起点 GG
          if (isUp && curr.low < curDd) {
            break;
          }
          if (!isUp && curr.high > curGg) {
            break;
          }

          const isTrendDir =
            (isUp && curr.trend === TrendDirection.Up) ||
            (!isUp && curr.trend === TrendDirection.Down);
          const hasBrokenOut =
            isTrendDir && (isUp ? curr.high > curGg : curr.low < curDd);

          if (hasBrokenOut) {
            const newGg = isUp ? Math.max(curGg, curr.high) : curGg;
            const newDd = !isUp ? Math.min(curDd, curr.low) : curDd;

            if (
              checkDepartureRules(
                data,
                nextIdx,
                isUp,
                curZg,
                curZd,
                newGg,
                newDd,
                strategy,
              )
            ) {
              channelElements.push(curr);
              curGg = newGg;
              curDd = newDd;
              nextIdx++;
              hasSealedDeparture = true;
              if (channelElements.length >= 9) isExpanded = true;
              break;
            }
          }
        } else {
          // 当 channelElements.length 为奇数时（如段中枢 3, 5, 7...），curr 为反向内部段，nextElem 为顺势段
          if (nextIdx + 1 < count) {
            const nextElem = data[nextIdx + 1];
            const nextIsTrendDir =
              (isUp && nextElem.trend === TrendDirection.Up) ||
              (!isUp && nextElem.trend === TrendDirection.Down);
            const nextBrokenOut =
              nextIsTrendDir &&
              (isUp ? nextElem.high > curGg : nextElem.low < curDd);

            if (nextBrokenOut) {
              const tempZd = Math.max(curZd, curr.low);
              const tempZg = Math.min(curZg, curr.high);
              let testZg = curZg;
              let testZd = curZd;
              if (tempZg > tempZd) {
                testZg = tempZg;
                testZd = tempZd;
              }
              const newGg = isUp ? Math.max(curGg, nextElem.high) : curGg;
              const newDd = !isUp ? Math.min(curDd, nextElem.low) : curDd;

              if (
                checkDepartureRules(
                  data,
                  nextIdx + 1,
                  isUp,
                  testZg,
                  testZd,
                  newGg,
                  newDd,
                  strategy,
                )
              ) {
                channelElements.push(curr, nextElem);
                curZg = testZg;
                curZd = testZd;
                curGg = newGg;
                curDd = newDd;
                nextIdx += 2;
                hasSealedDeparture = true;
                if (channelElements.length >= 9) isExpanded = true;
                break;
              }
            }
          }
        }

        // 触及震荡延伸检验：配对 (curr, nextElem)
        if (nextIdx + 1 < count) {
          const nextElem = data[nextIdx + 1];
          if (nextElem.trend === curr.trend) {
            break;
          }

          const testWindow = [...channelElements, curr, nextElem];
          const allHighMinMax = minMaxBy(testWindow, (e) => e.high);
          const allLowMinMax = minMaxBy(testWindow, (e) => e.low);

          if (
            allHighMinMax &&
            allLowMinMax &&
            allHighMinMax.min > allLowMinMax.max
          ) {
            channelElements.push(curr, nextElem);
            curZg = allHighMinMax.min;
            curZd = allLowMinMax.max;
            curGg = Math.max(curGg, curr.high, nextElem.high);
            curDd = Math.min(curDd, curr.low, nextElem.low);
            nextIdx += 2;
            if (channelElements.length >= 9) {
              isExpanded = true;
            }
            continue;
          } else {
            break;
          }
        } else {
          // 序列末尾单元素触及吸纳
          if (curr.high >= curZd && curr.low <= curZg) {
            const newZg = Math.min(curZg, curr.high);
            const newZd = Math.max(curZd, curr.low);
            if (newZg > newZd) {
              channelElements.push(curr);
              curZg = newZg;
              curZd = newZd;
              curGg = Math.max(curGg, curr.high);
              curDd = Math.min(curDd, curr.low);
              nextIdx++;
              if (channelElements.length >= 9) {
                isExpanded = true;
              }
            }
          }
          break;
        }
      }

      // 3. 门槛校验与结果记录
      // 若达成顺势离开封存、满 9 元素扩展，或处于历史走势中且元素数达到封存门槛，中枢完结
      const isAtDataEnd = nextIdx >= count || count - nextIdx <= 2;
      const isComplete =
        hasSealedDeparture ||
        isExpanded ||
        (!isAtDataEnd && channelElements.length >= strategy.minSealedLength);

      // 未完结中枢若未处在数据末端，说明已属于历史走势中未成型的结构，丢弃不输出
      if (!isComplete && !isAtDataEnd) {
        cursor++;
        continue;
      }

      const minRequiredLength = isComplete
        ? strategy.minSealedLength
        : strategy.minCoreLength;

      if (channelElements.length < minRequiredLength) {
        cursor++;
        continue;
      }

      // 未触发离开封存且未达成 9 元素扩展时（处于未完成状态）：
      // 检查反向崩塌守卫：若末尾元素已破坏结构（核心笔打穿进入笔起点，或延伸笔打穿反向沿），候选中枢失效作废
      if (!isComplete) {
        const firstElem = channelElements[0];
        const lastElem = channelElements[channelElements.length - 1];
        const hasCollapsed =
          channelElements.length > strategy.minCoreLength
            ? isUp
              ? lastElem.low < curZd
              : lastElem.high > curZg
            : isUp
              ? lastElem.low < firstElem.low
              : lastElem.high > firstElem.high;

        if (hasCollapsed) {
          cursor++;
          continue;
        }
      }

      const phaseAChannel = strategy.buildPhaseAChannel(
        channelElements,
        data,
        cursor,
        coreInfo.geometry,
      );
      if (phaseAChannel) {
        phaseA.push(phaseAChannel);
      }

      const outputChannel = strategy.buildSealedChannel(
        channelElements,
        data,
        cursor,
        { zg: curZg, zd: curZd, gg: curGg, dd: curDd },
        isExpanded,
        isComplete,
      );
      sequential.push(outputChannel);

      // 推进游标至离开单元继续寻找后续中枢
      cursor = cursor + channelElements.length - 1;
    }

    return { phaseA, sequential };
  }
}
