import type { KernelSignal } from '../kernel/kernel.types';
import { resolveIntent } from '../trading/rules';
import type { SimulationSignal } from './strategy-simulation.types';

const EXIT_INTENT = 'EXIT';
const EXTRACTOR_NODE_TYPE = 'EXTRACTOR';
const DEFAULT_BUY_BADGE = '买点';
const DEFAULT_SELL_BADGE = '卖点';

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
  const isBuy = resolveIntent(signal) !== EXIT_INTENT;
  const evidenceType = readEvidenceEventType(signal);
  const signalType = evidenceType ?? signal.signalType;
  const badgeText =
    signal.badgeText ??
    (signal.contextSnapshot as any)?.badgeText ??
    (signal.decisionTrace as any)?.badgeText ??
    (isBuy ? DEFAULT_BUY_BADGE : DEFAULT_SELL_BADGE);
  return {
    signalTime: signal.signalTime.toISOString(),
    pivotTime: signal.pivotTime ?? null,
    pivotPrice: signal.pivotPrice ?? null,
    triggerPrice: signal.triggerPrice,
    signalType,
    badgeText,
    isBuy,
    decisionTrace: signal.decisionTrace,
    securityCode: options.securityCode,
    period: options.period,
  };
}

function readEvidenceEventType(signal: KernelSignal): string | null {
  const trace = signal.decisionTrace?.trace;
  if (!Array.isArray(trace)) return null;
  for (const item of trace as ReadonlyArray<{
    type?: unknown;
    role?: unknown;
    passed?: unknown;
    evidence?: Record<string, unknown>;
  }>) {
    if (!item || typeof item !== 'object') continue;
    if (item.passed === false) continue;
    if (
      item.type === EXTRACTOR_NODE_TYPE ||
      item.role === EXTRACTOR_NODE_TYPE
    ) {
      continue;
    }
    const evidence = item.evidence;
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
