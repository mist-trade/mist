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
  /** 是否允许末端未完成中枢（若为 false，则为历史走势切片，绝不产生 UnComplete 中枢） */
  readonly allowUncomplete?: boolean;
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
  curGg: number,
  curDd: number,
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

  const curr = data[candidateIdx];

  // 离开笔封存核心准则（2 选 1）：
  // 条件 1：后续笔出现 3 买 / 3 卖（回抽不跌回/升回中枢 [ZD, ZG]）：
  const is3rdPoint = isUp ? pullback.low > curZg : pullback.high < curZd;
  if (is3rdPoint) {
    return true;
  }

  // 条件 2：后续笔没有出现 3买/3卖，但是出现了 2s（下跌对称出现 2b）
  // 用户铁律：即使是 5 笔基础中枢，如果在没有出现 3b/3s 的情况下，离开笔的最大值必须高于 GG（下跌低于 DD）
  const hasBrokenExtreme = isUp ? curr.high > curGg : curr.low < curDd;
  if (hasBrokenExtreme) {
    // 检查是否出现 2s（二卖，次高点）/ 2b（二买，次低点）：
    if (candidateIdx + 2 < count) {
      const bounce = data[candidateIdx + 2];
      if (bounce.trend === curr.trend) {
        const isSecondClassPoint = isUp
          ? bounce.high < curr.high
          : bounce.low > curr.low;
        if (isSecondClassPoint) {
          // 确认 2s/2b 已经转折成型（后续已转向，或已到达数据末端）
          if (
            candidateIdx + 3 >= count ||
            data[candidateIdx + 3].trend !== bounce.trend
          ) {
            return true;
          }
        }
      }
    }

    // 规则 2：反向一笔物理反转打穿对侧极值（暴跌打穿 DD / 暴涨打穿 GG）：
    // 走势结构被物理反转彻底破坏，绝不可能再给 3 买/3 卖或 2s/2b，直接在离开极值端点封存
    const piercesOppositeExtreme = isUp
      ? pullback.low < curDd
      : pullback.high > curGg;
    if (piercesOppositeExtreme) {
      return true;
    }
  }

  // 3. 规则 3（仅限 Duan 级别段中枢）：无 3买/3卖，离开后反向单段直接打穿中枢对向沿 (ZD/ZG)
  if (strategy.minCoreLength <= 3) {
    const pbPiercesBoundary = isUp
      ? pullback.low < curZd
      : pullback.high > curZg;
    if (pbPiercesBoundary) {
      return true;
    }
  }

  // 4. 规则 4：后续走势自身已独立构成完全不重叠的新中枢核心
  const checkNewCore = (startIdx: number): boolean => {
    if (startIdx + strategy.minCoreLength > count) {
      return false;
    }
    const newCoreCandidate = data.slice(
      startIdx,
      startIdx + strategy.minCoreLength,
    );
    if (
      validateTrendAlternating(newCoreCandidate) &&
      newCoreCandidate.length === strategy.minCoreLength
    ) {
      const newCore = strategy.validateCore(newCoreCandidate);
      if (newCore) {
        const isHigher = newCore.geometry.zd >= curZg;
        const isLower = newCore.geometry.zg <= curZd;
        if (isHigher || isLower) {
          return true;
        }
      }
    }
    return false;
  };

  for (let offset = 0; offset <= 1; offset++) {
    if (checkNewCore(candidateIdx + offset)) {
      return true;
    }
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
      const firstElem = channelElements[0];
      let isExpanded = false;
      let hasSealedDeparture = false;
      let hasCollapsed = false;
      let nextIdx = cursor + strategy.minCoreLength;

      // 2. 状态机推进：
      if (strategy.minCoreLength > 3) {
        // =====================================================================
        // 笔级中枢专属推进引擎（严格区分 5 笔基本中枢与超过 5 笔的扩展阶段）
        // =====================================================================
        let lastCandidateDeparture: {
          elementCount: number;
          newGg: number;
          newDd: number;
        } | null = null;

        while (nextIdx < count) {
          const curr = data[nextIdx];
          if (curr.trend === data[nextIdx - 1].trend) {
            break;
          }

          // -------------------------------------------------------------------
          // 阶段一：5 笔基本中枢阶段（当前 channelElements 包含 4 笔核心，curr 为第 5 笔）
          // -------------------------------------------------------------------
          if (channelElements.length === 4) {
            const pullback = nextIdx + 1 < count ? data[nextIdx + 1] : null;

            // 离开笔必须突破中枢区间（若未突破则属于内部震荡）
            const hasBrokenOut = isUp ? curr.high > curZg : curr.low < curZd;

            const piercesOrigin =
              pullback !== null &&
              (isUp
                ? pullback.low < firstElem.low
                : pullback.high > firstElem.high);

            // 规则 1.1: 检验 5 笔中枢离开封存（在无 3b/3s 时必须突破前期极值 GG/DD）
            const departureOk =
              hasBrokenOut &&
              checkDepartureRules(
                data,
                nextIdx,
                isUp,
                curZg,
                curZd,
                curGg,
                curDd,
                strategy,
              );

            // 规则 1.2: 离开封存判定
            if (departureOk) {
              channelElements.push(curr);
              curGg = isUp ? Math.max(curGg, curr.high) : curGg;
              curDd = !isUp ? Math.min(curDd, curr.low) : curDd;
              nextIdx++;
              hasSealedDeparture = true;
              break;
            }

            // 规则 1.3: 若未曾满足离开封存便反向击穿进入笔起点，说明非本向中枢（细节 2，重新评估反向走势）
            if (piercesOrigin) {
              hasCollapsed = true;
              break;
            }

            // 未能直接封存且后一笔未击穿起点：吸纳 curr 与 pullback 进入中枢扩展阶段
            if (pullback !== null) {
              channelElements.push(curr, pullback);
              nextIdx += 2;
              // 方式 A：全量公共交集动态更新
              const allHigh = minMaxBy(channelElements, (e) => e.high);
              const allLow = minMaxBy(channelElements, (e) => e.low);
              if (allHigh && allLow && allHigh.min > allLow.max) {
                curZg = allHigh.min;
                curZd = allLow.max;
              } else {
                isExpanded = true;
              }
              curGg = Math.max(curGg, curr.high, pullback.high);
              curDd = Math.min(curDd, curr.low, pullback.low);
              continue;
            } else {
              // 数据末端单元素触及吸纳
              const allHigh = minMaxBy(
                [...channelElements, curr],
                (e) => e.high,
              );
              const allLow = minMaxBy([...channelElements, curr], (e) => e.low);
              if (allHigh && allLow && allHigh.min > allLow.max) {
                curZg = allHigh.min;
                curZd = allLow.max;
              } else {
                isExpanded = true;
              }
              curGg = Math.max(curGg, curr.high);
              curDd = Math.min(curDd, curr.low);
              channelElements.push(curr);
              nextIdx++;
              break;
            }
          }

          // -------------------------------------------------------------------
          // 阶段二：超过 5 笔的中枢扩展阶段（channelElements.length >= 6）
          // -------------------------------------------------------------------
          const pullback = nextIdx + 1 < count ? data[nextIdx + 1] : null;

          // A. 备选离开笔判定：扩展阶段离开笔最高点必须高于 GG（下跌最低点低于 DD）
          const breaksExtreme = isUp ? curr.high > curGg : curr.low < curDd;
          if (breaksExtreme) {
            const candidateGg = isUp ? Math.max(curGg, curr.high) : curGg;
            const candidateDd = !isUp ? Math.min(curDd, curr.low) : curDd;

            const departureOk = checkDepartureRules(
              data,
              nextIdx,
              isUp,
              curZg,
              curZd,
              curGg,
              curDd,
              strategy,
            );

            if (departureOk) {
              channelElements.push(curr);
              curGg = candidateGg;
              curDd = candidateDd;
              nextIdx++;
              hasSealedDeparture = true;
              if (channelElements.length >= 9) isExpanded = true;
              break;
            }

            // 记录有效备选离开笔
            lastCandidateDeparture = {
              elementCount: channelElements.length + 1,
              newGg: candidateGg,
              newDd: candidateDd,
            };
          }

          // B. 反向 3 卖 / 3 买 封存（中枢下方 3 卖或上方 3 买，封存 2 笔前）
          if (pullback !== null && nextIdx + 2 < count) {
            const bounce = data[nextIdx + 2];
            if (bounce.trend === curr.trend) {
              const isOpposite3rd = isUp
                ? pullback.low < curZd && bounce.high < curZd
                : pullback.high > curZg && bounce.low > curZg;
              if (isOpposite3rd) {
                channelElements.push(curr);
                curGg = Math.max(curGg, curr.high);
                curDd = Math.min(curDd, curr.low);
                nextIdx++;
                hasSealedDeparture = true;
                if (channelElements.length >= 9) isExpanded = true;
                break;
              }
            }
          }

          // C. 反向击穿起笔极值守卫与细节 2
          const violatesOrigin = isUp
            ? curr.low < firstElem.low ||
              (pullback !== null && pullback.low < firstElem.low)
            : curr.high > firstElem.high ||
              (pullback !== null && pullback.high > firstElem.high);

          if (violatesOrigin) {
            if (lastCandidateDeparture) {
              // 存在有效备选离开笔：回退封存在该离开笔
              channelElements.push(curr);
              channelElements.splice(lastCandidateDeparture.elementCount);
              curGg = lastCandidateDeparture.newGg;
              curDd = lastCandidateDeparture.newDd;
              hasSealedDeparture = true;
              if (channelElements.length >= 9) isExpanded = true;
              break;
            } else {
              // 细节 2：扩展阶段从未走出新高，直接击穿起笔点，说明非本向中枢，第二笔实际上是反向中枢起点
              hasCollapsed = true;
              break;
            }
          }

          // D. 震荡吸纳与全量公共交集动态更新（方式 A）
          if (pullback !== null) {
            channelElements.push(curr, pullback);
            nextIdx += 2;
            const allHigh = minMaxBy(channelElements, (e) => e.high);
            const allLow = minMaxBy(channelElements, (e) => e.low);
            if (allHigh && allLow && allHigh.min > allLow.max) {
              curZg = allHigh.min;
              curZd = allLow.max;
            } else {
              isExpanded = true;
            }
            curGg = Math.max(curGg, curr.high, pullback.high);
            curDd = Math.min(curDd, curr.low, pullback.low);
            if (channelElements.length >= 9) isExpanded = true;
          } else {
            // 数据末端单元素触及吸纳
            const allHigh = minMaxBy([...channelElements, curr], (e) => e.high);
            const allLow = minMaxBy([...channelElements, curr], (e) => e.low);
            if (allHigh && allLow && allHigh.min > allLow.max) {
              curZg = allHigh.min;
              curZd = allLow.max;
            } else {
              isExpanded = true;
            }
            curGg = Math.max(curGg, curr.high);
            curDd = Math.min(curDd, curr.low);
            channelElements.push(curr);
            nextIdx++;
            if (channelElements.length >= 9) isExpanded = true;
            break;
          }
        }
      } else {
        // =====================================================================
        // 段级中枢推进引擎（保持原有对称生命周期推进）
        // =====================================================================
        while (nextIdx < count) {
          const curr = data[nextIdx];
          if (curr.trend === data[nextIdx - 1].trend) {
            break;
          }

          if (nextIdx + 1 < count) {
            const nextElem = data[nextIdx + 1];
            const nextIsTrendDir =
              (isUp && nextElem.trend === TrendDirection.Up) ||
              (!isUp && nextElem.trend === TrendDirection.Down);
            const nextBrokenOut =
              nextIsTrendDir &&
              (isUp ? nextElem.high > curZg : nextElem.low < curZd);

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
                  curGg,
                  curDd,
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
      }

      // 3. 门槛校验与结果记录
      if (hasCollapsed) {
        cursor++;
        continue;
      }

      const allowUncomplete = strategy.allowUncomplete ?? true;
      const isAtDataEnd =
        allowUncomplete && (nextIdx >= count || count - nextIdx <= 2);
      const isComplete =
        hasSealedDeparture ||
        (!isAtDataEnd &&
          strategy.minSealedLength <= 3 &&
          channelElements.length >= 3);

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
        const lastElem = channelElements[channelElements.length - 1];
        const hasCollapsedAtEnd =
          channelElements.length > strategy.minCoreLength
            ? isUp
              ? lastElem.low < curZd
              : lastElem.high > curZg
            : isUp
              ? lastElem.low < firstElem.low
              : lastElem.high > firstElem.high;

        if (hasCollapsedAtEnd) {
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
        isExpanded || channelElements.length >= 9,
        isComplete,
      );
      sequential.push(outputChannel);

      // 推进游标至离开单元继续寻找后续中枢
      cursor = cursor + channelElements.length - 1;
    }

    return { phaseA, sequential };
  }
}
