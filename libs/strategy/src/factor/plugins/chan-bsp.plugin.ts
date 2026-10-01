import {
  BiStatus,
  BiType,
  ChanCore,
  ChanBspType,
  DuanStatus,
  DuanType,
  FenxingType,
  type ChanBspUnit,
  type ChanDivergenceZhongshu,
  type ChanK,
} from '@app/chancore';
import { computeChanUnitForces } from '@app/indicators';
import type { ProjectedStrategyBar } from '@app/market-data';
import {
  detectLatestConfirmedFenxing,
  type ConfirmedFenxingResult,
} from '../../analysis/chan-fenxing-trigger';
import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';
import {
  DECISION_ACTIONS,
  CHAN_BSP_UNITS,
  CHAN_BSP_DIRECTIONS,
  DEFAULT_REQUIRED_BARS_DUAN,
  DEFAULT_REQUIRED_BARS_BI,
  BSP_CONFIDENCE,
  CANDIDATE_BSP_TYPES,
} from '../../strategy.constants';

export type ChanBspUnitLevel = 'bi' | 'duan';

export type ChanBspDirection = 'buy' | 'sell' | 'both';

export interface ChanBspPluginParams {
  readonly units?: ChanBspUnitLevel;
  readonly direction?: ChanBspDirection;
  readonly points?: {
    readonly first?: boolean;
    readonly second?: boolean;
    readonly third?: boolean;
  };
  readonly requiredBarCount?: number;
  readonly deduplicate?: boolean;
  readonly requireConfirmedFenxing?: boolean;
}

export interface ChanBspDetectedEvent {
  readonly type: ChanBspType;
  readonly units: ChanBspUnitLevel;
  readonly time: Date;
  readonly price: number;
  readonly zhongshuIndex: number | null;
  readonly zg: number | null;
  readonly zd: number | null;
  readonly unitIndex: number;
}

interface ScopeCursorRecord {
  lastEmittedPivotTime: number;
  emittedTypesAtLastPivotTime: Set<string>;
}

/**
 * 缠论买卖点因子插件
 * 封装 ChanCore 算法与增量游标，领域中立地输出 FactorOpinion
 */
export class ChanBspFactorPlugin implements FactorPlugin {
  public readonly id = 'plugin.chan.bsp';
  public readonly name = '缠论买卖点因子插件';
  public readonly category = 'CHAN' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '基于形态几何、特征序列与中枢背驰动力学计算缠论一/二/三类买卖点';

  public readonly paramSchema = {
    units: { type: 'string', enum: ['bi', 'duan'], default: 'bi' },
    direction: {
      type: 'string',
      enum: ['buy', 'sell', 'both'],
      default: 'buy',
    },
    points: {
      type: 'object',
      properties: {
        first: { type: 'boolean', default: true },
        second: { type: 'boolean', default: true },
        third: { type: 'boolean', default: true },
      },
    },
    requiredBarCount: { type: 'number', default: 50 },
    deduplicate: { type: 'boolean', default: true },
    requireConfirmedFenxing: { type: 'boolean', default: false },
  };

  /** 已发射信号单调游标：scopeKey -> ScopeCursorRecord */
  private readonly cursorMap = new Map<string, ScopeCursorRecord>();

  public resetCursors(): void {
    this.cursorMap.clear();
  }

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const params = this.resolveParams(rawParams);
    const minBars =
      params.requiredBarCount ??
      (params.units === CHAN_BSP_UNITS.DUAN
        ? DEFAULT_REQUIRED_BARS_DUAN
        : DEFAULT_REQUIRED_BARS_BI);

    if (context.bars.length < minBars) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: `K线不足${minBars}根(当前${context.bars.length}根)，无法确立缠论结构`,
      };
    }

    const klines = this.toChanKSeries(context.bars);
    if (klines.length === 0) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: '有效行情数据为空，未形成缠论K线',
      };
    }

    const units = params.units ?? CHAN_BSP_UNITS.BI;
    const allEvents = this.detectEvents(klines, units);
    const matchedEvents = allEvents.filter((event) =>
      this.matchesFilter(event, params),
    );

    if (matchedEvents.length === 0) {
      return {
        action: DECISION_ACTIONS.NEUTRAL,
        confidence: 0.0,
        reason: '未检测到满足条件的缠论买卖点',
      };
    }

    // 处理去重游标（单调极值时间游标守护，严禁回溯发射早于已发射极值时间的事件）
    let candidateEvents = matchedEvents;
    if (params.deduplicate) {
      const scopeKey = `${context.securityId}:${context.period}:${units}`;
      let record = this.cursorMap.get(scopeKey);
      if (!record) {
        record = {
          lastEmittedPivotTime: -1,
          emittedTypesAtLastPivotTime: new Set<string>(),
        };
        this.cursorMap.set(scopeKey, record);
      }

      const seenInBatch = new Set<string>();
      candidateEvents = matchedEvents.filter((e) => {
        const t = e.time.getTime();
        // 严格单调门禁：禁止发射早于上次已发射极值时间的事件
        if (t < record!.lastEmittedPivotTime) {
          return false;
        }
        if (t === record!.lastEmittedPivotTime) {
          if (
            record!.emittedTypesAtLastPivotTime.has(e.type) ||
            seenInBatch.has(`${t}:${e.type}`)
          ) {
            return false;
          }
        } else {
          if (seenInBatch.has(`${t}:${e.type}`)) {
            return false;
          }
        }
        seenInBatch.add(`${t}:${e.type}`);
        return true;
      });

      if (candidateEvents.length === 0) {
        return {
          action: DECISION_ACTIONS.NEUTRAL,
          confidence: 0.0,
          reason: '缠论买卖点已在先前批次发射，无需重复触发',
        };
      }
    }

    // 取最新一个买卖点作为主要触发决策
    const latestEvent = candidateEvents[candidateEvents.length - 1];
    const isBuy = latestEvent.type.endsWith('_buy');

    // 方向一致性保护：本轮放行的候选事件必须与主要触发决策同向，严禁在同一决策帧混杂反向形态
    const finalCandidates = candidateEvents.filter((e) =>
      isBuy ? e.type.endsWith('_buy') : !e.type.endsWith('_buy'),
    );

    // 若开启当根分型确认门禁，必须满足最新 K 线刚刚确立底/顶分型
    let confirmedFenxing: ConfirmedFenxingResult | null = null;
    if (params.requireConfirmedFenxing) {
      confirmedFenxing = detectLatestConfirmedFenxing(klines);
      if (!confirmedFenxing) {
        return {
          action: DECISION_ACTIONS.NEUTRAL,
          confidence: 0.0,
          reason: '当前最新K线未确立有效分型扳机(笔内延伸或包含)',
        };
      }
      if (isBuy && confirmedFenxing.type !== FenxingType.Bottom) {
        return {
          action: DECISION_ACTIONS.NEUTRAL,
          confidence: 0.0,
          reason: '检测到买点结构，但最新确立分型为顶分型而非底分型',
        };
      }
      if (!isBuy && confirmedFenxing.type !== FenxingType.Top) {
        return {
          action: DECISION_ACTIONS.NEUTRAL,
          confidence: 0.0,
          reason: '检测到卖点结构，但最新确立分型为底分型而非顶分型',
        };
      }
    }

    // 确认放行后，将本轮候选事件更新至单调游标
    if (params.deduplicate) {
      const scopeKey = `${context.securityId}:${context.period}:${units}`;
      const record = this.cursorMap.get(scopeKey);
      if (record) {
        const maxTime = Math.max(
          ...finalCandidates.map((e) => e.time.getTime()),
        );
        if (maxTime > record.lastEmittedPivotTime) {
          record.lastEmittedPivotTime = maxTime;
          record.emittedTypesAtLastPivotTime = new Set(
            finalCandidates
              .filter((e) => e.time.getTime() === maxTime)
              .map((e) => e.type),
          );
        } else if (maxTime === record.lastEmittedPivotTime) {
          for (const e of finalCandidates) {
            if (e.time.getTime() === record.lastEmittedPivotTime) {
              record.emittedTypesAtLastPivotTime.add(e.type);
            }
          }
        }
      }
    }

    const action = isBuy ? DECISION_ACTIONS.BUY : DECISION_ACTIONS.SELL;
    const confidence = this.computeConfidence(latestEvent.type);
    const unitLabel = params.units === CHAN_BSP_UNITS.DUAN ? '线段' : '笔';
    const pointLabel = this.formatPointName(latestEvent.type);

    const lastBar =
      context.bars.length > 0 ? context.bars[context.bars.length - 1] : null;
    const currentBarClose =
      lastBar?.ohlc?.effective?.close ??
      (lastBar?.rawBar as any)?.close ??
      latestEvent.price;

    return {
      action,
      confidence,
      reason: `缠论${unitLabel}级${pointLabel}确认 (价格: ${latestEvent.price.toFixed(2)})`,
      evidence: {
        eventType: latestEvent.type,
        units: latestEvent.units,
        price: latestEvent.price,
        time: latestEvent.time.toISOString(),
        pivotTime: latestEvent.time.toISOString(),
        pivotPrice: latestEvent.price,
        triggerTime: context.timestamp.toISOString(),
        triggerPrice: currentBarClose,
        zg: latestEvent.zg,
        zd: latestEvent.zd,
        zhongshuIndex: latestEvent.zhongshuIndex,
        unitIndex: latestEvent.unitIndex,
        allCandidatesCount: finalCandidates.length,
        candidateEvents: finalCandidates.map((e) => ({
          eventType: e.type,
          units: e.units,
          price: e.price,
          time: e.time.toISOString(),
          pivotTime: e.time.toISOString(),
          pivotPrice: e.price,
          triggerTime: context.timestamp.toISOString(),
          triggerPrice: currentBarClose,
          zg: e.zg,
          zd: e.zd,
          zhongshuIndex: e.zhongshuIndex,
          unitIndex: e.unitIndex,
        })),
        fenxing: confirmedFenxing
          ? {
              type: confirmedFenxing.type,
              extremumPrice: confirmedFenxing.extremumPrice,
              stopLossPrice: confirmedFenxing.stopLossPrice,
              confirmedTime: confirmedFenxing.confirmedTime.toISOString(),
            }
          : undefined,
      },
    };
  }

  private resolveParams(params?: Record<string, unknown>): ChanBspPluginParams {
    return {
      units: (params?.units as ChanBspUnitLevel) ?? CHAN_BSP_UNITS.BI,
      direction:
        (params?.direction as ChanBspDirection) ?? CHAN_BSP_DIRECTIONS.BUY,
      points: {
        first: params?.points ? (params.points as any).first !== false : true,
        second: params?.points ? (params.points as any).second !== false : true,
        third: params?.points ? (params.points as any).third !== false : true,
      },
      requiredBarCount:
        typeof params?.requiredBarCount === 'number'
          ? params.requiredBarCount
          : undefined,
      deduplicate: params?.deduplicate !== false,
      requireConfirmedFenxing: params?.requireConfirmedFenxing === true,
    };
  }

  private toChanKSeries(
    bars: readonly ProjectedStrategyBar[],
  ): readonly ChanK[] {
    const series: ChanK[] = [];
    for (let i = 0; i < bars.length; i += 1) {
      const b = bars[i];
      const ohlc = b.ohlc.effective;
      if (!ohlc) continue;
      series.push({
        id: i + 1,
        symbol: String(b.rawBar.securityId),
        time: b.rawBar.timestamp,
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        volume: b.volume.effective,
        amount: b.amount.effective,
      });
    }
    return series;
  }

  private detectEvents(
    klines: readonly ChanK[],
    units: ChanBspUnitLevel,
  ): readonly ChanBspDetectedEvent[] {
    const bis = ChanCore.createBi(klines);
    const phaseB = bis.phaseB;

    let bspUnits: readonly ChanBspUnit[];
    let zhongshus: readonly ChanDivergenceZhongshu[];

    if (units === CHAN_BSP_UNITS.DUAN) {
      const duans = ChanCore.createDuan(phaseB);
      const validDuans = duans.filter(
        (d) => d.type === DuanType.Complete && d.status === DuanStatus.Valid,
      );
      const duanChannels = ChanCore.createDuanChannels(duans);
      bspUnits = validDuans.map(ChanCore.toBspUnit);
      zhongshus = duanChannels.phaseB.map(ChanCore.toZhongshu);
    } else {
      const validBis = phaseB.filter(
        (b) => b.type === BiType.Complete && b.status === BiStatus.Valid,
      );
      const channels = ChanCore.createChannels(klines);
      bspUnits = validBis.map(ChanCore.toBspUnit);
      zhongshus = channels.phaseB.map(ChanCore.toZhongshu);
    }

    const forces = computeChanUnitForces(klines, bspUnits);
    const rawPoints = ChanCore.detectBuySellPoints({
      units: bspUnits,
      zhongshus,
      forces,
    });

    return rawPoints.map((p) => {
      const unit = bspUnits[p.unitIndex];
      const zs =
        p.zhongshuIndex !== null ? (zhongshus[p.zhongshuIndex] ?? null) : null;
      return {
        type: p.type,
        units,
        time: unit.endTime,
        price: p.price,
        zhongshuIndex: p.zhongshuIndex,
        zg: zs ? zs.zg : null,
        zd: zs ? zs.zd : null,
        unitIndex: p.unitIndex,
      };
    });
  }

  private matchesFilter(
    event: ChanBspDetectedEvent,
    params: ChanBspPluginParams,
  ): boolean {
    const isBuy = event.type.endsWith('_buy');
    if (params.direction === CHAN_BSP_DIRECTIONS.BUY && !isBuy) return false;
    if (params.direction === CHAN_BSP_DIRECTIONS.SELL && isBuy) return false;

    const points = params.points ?? {};
    if (event.type.startsWith('first_') && points.first === false) return false;
    if (event.type.startsWith('second_') && points.second === false)
      return false;
    if (event.type.startsWith('third_') && points.third === false) return false;

    return true;
  }

  private computeConfidence(type: ChanBspType): number {
    switch (type) {
      case CANDIDATE_BSP_TYPES.FIRST_BUY:
      case CANDIDATE_BSP_TYPES.FIRST_SELL:
        return BSP_CONFIDENCE.FIRST;
      case CANDIDATE_BSP_TYPES.THIRD_BUY:
      case CANDIDATE_BSP_TYPES.THIRD_SELL:
        return BSP_CONFIDENCE.THIRD;
      case CANDIDATE_BSP_TYPES.SECOND_BUY:
      case CANDIDATE_BSP_TYPES.SECOND_SELL:
        return BSP_CONFIDENCE.SECOND;
      default:
        return BSP_CONFIDENCE.DEFAULT;
    }
  }

  private formatPointName(type: ChanBspType): string {
    switch (type) {
      case CANDIDATE_BSP_TYPES.FIRST_BUY:
        return '一买';
      case CANDIDATE_BSP_TYPES.FIRST_SELL:
        return '一卖';
      case CANDIDATE_BSP_TYPES.SECOND_BUY:
        return '二买';
      case CANDIDATE_BSP_TYPES.SECOND_SELL:
        return '二卖';
      case CANDIDATE_BSP_TYPES.THIRD_BUY:
        return '三买';
      case CANDIDATE_BSP_TYPES.THIRD_SELL:
        return '三卖';
      default:
        return type;
    }
  }
}
