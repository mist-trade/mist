import type { KernelSignal } from './kernel.types';

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export interface SignalPersistenceContext {
  readonly securityId: number;
  readonly securityCode?: string;
  readonly source: string;
  readonly period: number;
  readonly ruleSnapshot?: Readonly<Record<string, unknown>>;
}

export type PersistableKernelSignal = Pick<
  KernelSignal,
  | 'definitionId'
  | 'versionId'
  | 'signalKind'
  | 'signalTime'
  | 'triggerPrice'
  | 'signalType'
> & {
  readonly channel?: KernelSignal['channel'];
  readonly intent?: KernelSignal['intent'];
  readonly originPluginId?: KernelSignal['originPluginId'];
  readonly pivotTime?: string | Date | null;
  readonly pivotPrice?: number | null;
  readonly decisionTrace?: Readonly<Record<string, unknown>> | null;
  readonly contextSnapshot?: Readonly<Record<string, unknown>>;
  readonly ruleSnapshot?: Readonly<Record<string, unknown>>;
};

export interface SignalPersistencePayload {
  readonly definitionId: number;
  readonly versionId: number;
  readonly securityId: number;
  readonly securityCode?: string;
  readonly source: string;
  readonly period: number;
  readonly signalKind: 'entry' | 'exit';
  /** 通道引用：阶段一写入 contextSnapshot 观测，暂不落独立列。 */
  readonly channel: KernelSignal['channel'];
  readonly intent: KernelSignal['intent'];
  readonly originPluginId: KernelSignal['originPluginId'];
  readonly signalTime: Date;
  readonly pivotTime: Date | null;
  readonly triggerPrice: number;
  readonly signalType: string;
  readonly decisionTrace: Record<string, unknown> | null;
  readonly contextSnapshot: Record<string, unknown>;
  readonly ruleSnapshot: Record<string, unknown>;
}

/**
 * 统一内核信号落盘转换函数（全链路单一同构映射器）。
 * 彻底杜绝实时侧与回测侧各自手写映射导致的字段错漏（如 pivotTime, triggerPrice, ruleSnapshot）。
 */
export function mapKernelSignalToPersistencePayload(
  signal: PersistableKernelSignal,
  context: SignalPersistenceContext,
): SignalPersistencePayload {
  const signalTime = isValidDate(signal.signalTime)
    ? signal.signalTime
    : new Date(signal.signalTime);

  const pivotTime = signal.pivotTime
    ? isValidDate(signal.pivotTime)
      ? signal.pivotTime
      : new Date(signal.pivotTime)
    : null;
  const triggerPrice = signal.triggerPrice;

  const contextSnapshot: Record<string, unknown> = {
    ...signal.contextSnapshot,
    triggerPrice,
    ...(signal.channel ? { channel: signal.channel } : {}),
    ...(signal.intent ? { intent: signal.intent } : {}),
    ...(signal.originPluginId ? { originPluginId: signal.originPluginId } : {}),
  };

  const ruleSnapshot: Record<string, unknown> = {
    ...(signal.ruleSnapshot ?? context.ruleSnapshot ?? {}),
  };

  return {
    definitionId: signal.definitionId,
    versionId: signal.versionId,
    securityId: context.securityId,
    securityCode: context.securityCode,
    source: context.source,
    period: context.period,
    signalKind: signal.signalKind,
    channel: signal.channel,
    intent: signal.intent,
    originPluginId: signal.originPluginId,
    signalTime,
    pivotTime,
    triggerPrice,
    signalType: signal.signalType,
    decisionTrace: signal.decisionTrace ? { ...signal.decisionTrace } : null,
    contextSnapshot,
    ruleSnapshot,
  };
}
