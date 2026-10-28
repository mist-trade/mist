import type { KernelSignal } from '../kernel/kernel.types';
import type { TacticalEvent } from '../tactical-event/tactical-event.types';
import type { SimulationSignal } from './strategy-simulation.types';

/**
 * 战术事件 → 推演会话展示信号（SimulationSignal）。
 * 用于前端图表战术买卖点展示层。
 */
export function mapTacticalEventToSimulationSignal(
  event: TacticalEvent,
  options: { readonly securityCode: string; readonly period: number },
): SimulationSignal {
  const isBuy = event.action === 'BUY';
  return {
    signalTime: event.timestamp.toISOString(),
    triggerTime: event.timestamp.toISOString(),
    pivotTime: event.pivotTime ?? event.timestamp.toISOString(),
    pivotPrice: event.pivotPrice ?? event.triggerPrice,
    triggerPrice: event.triggerPrice,
    signalType: event.displayTag,
    badgeText: event.badgeText,
    isBuy,
    confidence: event.confidence,
    decisionTrace: event.triggerSignal.decisionTrace,
    securityCode: options.securityCode,
    period: options.period,
  };
}

/**
 * 内核信号 → 推演会话展示信号（SimulationSignal）。
 * signalType 以决策流 trace 证据中的 eventType 优先（一买/二买/三买等结构类型），
 * 缺省回退 signalTag/action。
 * badgeText 遵循纯透传原则：优先取内核/上下文/轨迹中的 badgeText，兜底为“买点”/“卖点”。
 */
export function mapKernelSignalToSimulationSignal(
  signal: KernelSignal,
  options: { readonly securityCode: string; readonly period: number },
): SimulationSignal {
  const isBuy = signal.signalKind === 'entry';
  const evidenceType = readEvidenceEventType(signal);
  const signalType = evidenceType ?? signal.signalType;
  const badgeText =
    signal.badgeText ??
    (signal.contextSnapshot as any)?.badgeText ??
    (signal.decisionTrace as any)?.badgeText ??
    (isBuy ? '买点' : '卖点');
  return {
    signalTime: signal.signalTime.toISOString(),
    triggerTime: signal.triggerTime,
    pivotTime: signal.pivotTime ?? signal.signalTime.toISOString(),
    pivotPrice: signal.pivotPrice ?? signal.triggerPrice,
    triggerPrice: signal.triggerPrice,
    signalType,
    badgeText,
    isBuy,
    confidence: signal.confidence,
    decisionTrace: signal.decisionTrace,
    securityCode: options.securityCode,
    period: options.period,
  };
}

function readEvidenceEventType(signal: KernelSignal): string | null {
  const trace = signal.decisionTrace?.trace;
  if (!Array.isArray(trace)) return null;
  for (const item of trace as ReadonlyArray<{
    evidence?: Record<string, unknown>;
  }>) {
    const evidence = item?.evidence;
    if (!evidence || typeof evidence !== 'object') continue;
    const rawType =
      evidence.eventType ??
      evidence.bspType ??
      evidence.type ??
      evidence.pointType ??
      evidence.signalType;
    if (typeof rawType === 'string' && rawType.length > 0) return rawType;
  }
  return null;
}
