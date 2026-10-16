import type { KernelSignal } from './kernel.types';

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
  | 'confidence'
> & {
  readonly confidenceLevel: KernelSignal['confidenceLevel'] | null;
  readonly triggerTime?: string;
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
  readonly signalTime: Date;
  readonly pivotTime: Date | null;
  readonly triggerTime: string;
  readonly triggerPrice: number;
  readonly signalType: string;
  readonly confidence: number;
  readonly confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  readonly decisionTrace: Record<string, unknown> | null;
  readonly contextSnapshot: Record<string, unknown>;
  readonly ruleSnapshot: Record<string, unknown>;
}

/**
 * 统一内核信号落盘转换函数（全链路单一同构映射器）。
 * 彻底杜绝实时侧与回测侧各自手写映射导致的字段错漏（如 pivotTime, triggerPrice, triggerTime, ruleSnapshot）。
 */
export function mapKernelSignalToPersistencePayload(
  signal: PersistableKernelSignal,
  context: SignalPersistenceContext,
): SignalPersistencePayload {
  const signalTime =
    signal.signalTime instanceof Date
      ? signal.signalTime
      : new Date(signal.signalTime);

  const pivotTime = signal.pivotTime ? new Date(signal.pivotTime) : null;
  const triggerTime = signal.triggerTime || signalTime.toISOString();
  const triggerPrice = signal.triggerPrice;

  const contextSnapshot: Record<string, unknown> = {
    ...signal.contextSnapshot,
    triggerTime,
    triggerPrice,
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
    signalTime,
    pivotTime,
    triggerTime,
    triggerPrice,
    signalType: signal.signalType,
    confidence: signal.confidence,
    confidenceLevel: signal.confidenceLevel,
    decisionTrace: signal.decisionTrace ? { ...signal.decisionTrace } : null,
    contextSnapshot,
    ruleSnapshot,
  };
}
