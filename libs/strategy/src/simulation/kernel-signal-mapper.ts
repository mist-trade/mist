import type {
  KernelSignal,
} from '../kernel/kernel.types';
import type { SimulationSignal } from './strategy-simulation.types';

/**
 * 缠论买卖点类型 → 前端徽标文案。旧 StrategySimulationEngine 的展示映射整体迁移。
 */
export function formatBadgeText(
  signalType: string,
  isBuy: boolean,
): string {
  switch (signalType) {
    case 'first_buy':
      return '1买';
    case 'second_buy':
      return '2买';
    case 'third_buy':
      return '3买';
    case 'first_sell':
      return '1卖';
    case 'second_sell':
      return '2卖';
    case 'third_sell':
      return '3卖';
    default:
      return isBuy ? '买点' : '卖点';
  }
}

/**
 * 内核信号 → 推演会话展示信号（SimulationSignal）。
 * signalType 以决策流 trace 证据中的 eventType 优先（一买/二买/三买等结构类型），
 * 缺省回退 signalTag/action。
 */
export function mapKernelSignalToSimulationSignal(
  signal: KernelSignal,
  options: { readonly securityCode: string; readonly period: number },
): SimulationSignal {
  const isBuy = signal.signalKind === 'entry';
  const evidenceType = readEvidenceEventType(signal);
  const signalType = evidenceType ?? signal.signalType;
  const badgeText = formatBadgeText(signalType, isBuy);
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
