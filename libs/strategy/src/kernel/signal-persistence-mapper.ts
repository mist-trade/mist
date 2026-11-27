import type { KernelSignal } from './kernel.types';

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function readOptionalFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
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
  readonly badgeText?: string | null;
  readonly displayTag?: string | null;
  readonly styleMeta?: Readonly<Record<string, unknown>> | null;
  readonly triggerPeriod?: number | null;
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
  readonly pivotPrice: number | null;
  readonly triggerPrice: number;
  readonly signalType: string;
  readonly badgeText: string | null;
  readonly displayTag: string | null;
  readonly styleMeta: Readonly<Record<string, unknown>> | null;
  readonly triggerPeriod: number | null;
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
  const pivotPrice =
    readOptionalFiniteNumber(signal.pivotPrice) ??
    readOptionalFiniteNumber(signal.contextSnapshot?.pivotPrice);
  const badgeText =
    readOptionalNonEmptyString(signal.badgeText) ??
    readOptionalNonEmptyString(signal.contextSnapshot?.badgeText);
  const displayTag =
    readOptionalNonEmptyString(signal.displayTag) ??
    readOptionalNonEmptyString(signal.contextSnapshot?.displayTag);
  const styleMeta =
    readOptionalRecord(signal.styleMeta) ??
    readOptionalRecord(signal.contextSnapshot?.styleMeta);
  const triggerPeriod =
    readOptionalFiniteNumber(signal.triggerPeriod) ??
    readOptionalFiniteNumber(signal.contextSnapshot?.triggerPeriod);

  const contextSnapshot: Record<string, unknown> = {
    ...signal.contextSnapshot,
    triggerPrice,
    ...(signal.channel ? { channel: signal.channel } : {}),
    ...(signal.intent ? { intent: signal.intent } : {}),
    ...(signal.originPluginId ? { originPluginId: signal.originPluginId } : {}),
    ...(pivotPrice !== null ? { pivotPrice } : {}),
    ...(badgeText !== null ? { badgeText } : {}),
    ...(displayTag !== null ? { displayTag } : {}),
    ...(styleMeta !== null ? { styleMeta } : {}),
    ...(triggerPeriod !== null ? { triggerPeriod } : {}),
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
    pivotPrice,
    triggerPrice,
    signalType: signal.signalType,
    badgeText,
    displayTag,
    styleMeta,
    triggerPeriod,
    decisionTrace: signal.decisionTrace ? { ...signal.decisionTrace } : null,
    contextSnapshot,
    ruleSnapshot,
  };
}
