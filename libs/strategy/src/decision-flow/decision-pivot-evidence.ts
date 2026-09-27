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
 * 兼容兜底：旧版轨迹无结构化 evidence 类型字段时，按 reason 文案识别缠论买卖点
 * （'一买'/'1买' 等）。仅用于历史轨迹兼容，新发射路径必须携带结构化 evidence。
 */
export function extractPivotEvidenceFromReason(
  result: DecisionResult,
): DecisionPivotEvidence | null {
  for (const item of result.trace) {
    const evidence = (item?.evidence ?? {}) as RawPivotEvidence;
    const reason = typeof item?.reason === 'string' ? item.reason : '';
    const matched =
      reason.includes('一买') ||
      reason.includes('1买') ||
      reason.includes('二买') ||
      reason.includes('2买') ||
      reason.includes('三买') ||
      reason.includes('3买') ||
      reason.includes('一卖') ||
      reason.includes('1卖') ||
      reason.includes('二卖') ||
      reason.includes('2卖') ||
      reason.includes('三卖') ||
      reason.includes('3卖');
    if (!matched) continue;
    return normalizePivotEvidence(evidence);
  }
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
