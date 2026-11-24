/**
 * 聚合分组纯域函数（REQ-FACADE-03，design 8.3）。
 *
 * (securityId, effectiveTime) 现算分组——effectiveTime = availabilityKey
 * （Bar 内容封存时刻），tradingDay = 上海日界。线上路径（apps/signal
 * processor 扇出）与离线路径（runTradingPipeline 门面）共用同一实现，
 * 分组规则不再有两份。
 */
import { availabilityKey } from '../kernel/availability';
import { formatShanghaiDateString } from '@app/timezone';

export interface GroupableSignal {
  readonly securityId: number;
  readonly period: number;
  readonly signalTime: Date;
}

export interface SignalGroupDescriptor {
  readonly securityId: number;
  /** availabilityKey 封存时刻（组内全部信号共同的可用时刻） */
  readonly effectiveTime: Date;
  /** 上海日界（YYYY-MM-DD） */
  readonly tradingDay: string;
}

export interface SignalGroup<T> {
  readonly descriptor: SignalGroupDescriptor;
  readonly members: readonly T[];
}

/**
 * 分组：组键 = `${securityId}\u0000${effectiveTime.getTime()}`。
 * selector 由调用方提供（扇出侧取候选信号字段，门面侧取 KernelSignal）。
 */
export function groupSignals<T>(
  signals: readonly T[],
  selector: (item: T) => GroupableSignal,
): Map<string, SignalGroup<T>> {
  const groups = new Map<string, SignalGroup<T>>();
  for (const item of signals) {
    const signal = selector(item);
    const effectiveTime = availabilityKey({
      period: signal.period,
      timestamp: signal.signalTime,
    });
    const key = `${signal.securityId}\u0000${effectiveTime.getTime()}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        descriptor: {
          securityId: signal.securityId,
          effectiveTime,
          tradingDay: formatShanghaiDateString(effectiveTime),
        },
        members: [],
      };
      groups.set(key, group);
    }
    (group.members as T[]).push(item);
  }
  return groups;
}
