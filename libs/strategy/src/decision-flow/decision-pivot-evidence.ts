import type {
  DecisionExecutionTraceItem,
  DecisionResult,
} from './decision-flow.types';

const NODE_TYPE_GUARD = 'GUARD';
const PLUGIN_ROLE_CONTEXT = 'context';

export interface DecisionPivotEvidence {
  readonly pivotTime?: string;
  readonly pivotPrice?: number;
}

interface RawPivotEvidence {
  readonly [key: string]: unknown;
}

/**
 * 筛选轨迹中具备归因资格的通过 GUARD 节点：
 * - 忽略失败节点（passed === false）与 EXTRACTOR / BRANCH / TERMINAL 节点；
 * - 优先保留非 context 角色节点；仅当整条通过轨迹完全不存在非 context GUARD 节点时，
 *   才兜底回退到 context 节点，以兼容纯单 context 插件用例。
 */
export function selectPassingGuardTraceItems(
  trace?: readonly DecisionExecutionTraceItem[],
): readonly DecisionExecutionTraceItem[] {
  if (!Array.isArray(trace) || trace.length === 0) {
    return [];
  }
  const passingGuards = trace.filter(
    (item): item is DecisionExecutionTraceItem =>
      Boolean(item) && item.passed !== false && item.type === NODE_TYPE_GUARD,
  );
  const signalGuards = passingGuards.filter(
    (item) => item.pluginRole !== PLUGIN_ROLE_CONTEXT,
  );
  return signalGuards.length > 0 ? signalGuards : passingGuards;
}

/**
 * 从白盒轨迹中倒序提取主归因展示徽标（badgeText），隔离 EXTRACTOR 与 context 角色节点。
 */
export function findBadgeTextFromTrace(
  trace?: readonly DecisionExecutionTraceItem[],
): string | undefined {
  const items = selectPassingGuardTraceItems(trace);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.badgeText && typeof item.badgeText === 'string') {
      return item.badgeText;
    }
    const ev = item.evidence as Record<string, unknown> | undefined;
    if (ev?.badgeText && typeof ev.badgeText === 'string') {
      return ev.badgeText;
    }
  }
  return undefined;
}

/**
 * 从决策流白盒轨迹中提取形态极值（pivot）证据。
 *
 * 提取对象是 ChanBspFactorPlugin 等因子插件发射的 evidence（携带 pivotTime/pivotPrice、
 * 以及兼容字段 time/price）。纯 DSL 门禁等无 pivot 语义的信号返回 null，落盘 pivot_time
 * 列写 NULL。
 */
export function extractPivotEvidence(
  result: DecisionResult,
): DecisionPivotEvidence | null {
  for (const item of selectPassingGuardTraceItems(result.trace)) {
    const evidence = item.evidence;
    if (!evidence || typeof evidence !== 'object') continue;
    const raw = evidence as RawPivotEvidence;
    // 仅接受显式买卖点类型字段；`type` 过于泛化（DSL 快照的 k.type 等）不入列
    const rawType =
      raw.eventType ?? raw.bspType ?? raw.pointType ?? raw.signalType;
    if (rawType === undefined || rawType === null) continue;
    return normalizePivotEvidence(raw);
  }
  return null;
}

/**
 * 历史兜底函数：已移除所有中文文本匹配，严格以结构化 evidence 为准。
 */
export function extractPivotEvidenceFromReason(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _result: DecisionResult,
): DecisionPivotEvidence | null {
  return null;
}

function normalizePivotEvidence(
  raw: RawPivotEvidence,
): DecisionPivotEvidence | null {
  const pivotTime = raw.pivotTime ?? raw.time;
  const pivotPrice = raw.pivotPrice ?? raw.price;
  if (typeof pivotTime !== 'string' && typeof pivotPrice !== 'number') {
    return null;
  }
  return {
    pivotTime: typeof pivotTime === 'string' ? pivotTime : undefined,
    pivotPrice: typeof pivotPrice === 'number' ? pivotPrice : undefined,
  };
}
