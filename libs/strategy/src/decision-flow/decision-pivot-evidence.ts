import type { DecisionResult } from './decision-flow.types';

export interface DecisionPivotEvidence {
  readonly pivotTime?: string;
  readonly pivotPrice?: number;
}

interface RawPivotEvidence {
  readonly [key: string]: unknown;
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
  for (const item of result.trace) {
    const evidence = item?.evidence;
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
