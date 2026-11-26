import type {
  DecisionExecutionTraceItem,
  DecisionResult,
} from './decision-flow.types';
import { DECISION_ACTIONS } from '../strategy.constants';

const STATUS_ABORTED = 'ABORTED';
const NODE_TYPE_GUARD = 'GUARD';
const MILESTONE_JOINER = ' + ';
const MILESTONE_SUFFIX = ' -> ';

export interface DecisionTraceSnapshot {
  readonly status: 'SIGNAL_EMITTED' | 'ABORTED';
  readonly action?: 'BUY' | 'SELL';
  readonly signalTag?: string;
  readonly summary: string;
  readonly trace: readonly DecisionExecutionTraceItem[];
}

/**
 * 统一白盒执行轨迹构建器 (DecisionExecutionTraceBuilder)
 * 替代旧版分散的 serializeStrategyContextSnapshot 与 serializeChanBspContextSnapshot，
 * 生成符合统一信封规范的白盒追溯快照与人类可读摘要
 */
export class DecisionExecutionTraceBuilder {
  /**
   * 将求值结果转换为可持久化存储的白盒轨迹快照
   */
  public static buildSnapshot(result: DecisionResult): DecisionTraceSnapshot {
    const summary = this.buildHumanReadableSummary(result);

    return {
      status: result.status,
      action: result.action,
      signalTag: result.signalTag,
      summary,
      trace: result.trace,
    };
  }

  /**
   * 生成一句话人类可读的决策归因摘要
   * 示范："门禁[财务安全门禁]通过 -> 触发买入信号 [BREAKOUT_RESONANCE]"
   */
  public static buildHumanReadableSummary(result: DecisionResult): string {
    if (result.status === STATUS_ABORTED) {
      return `阻断: ${result.reason}`;
    }

    const keyMilestones: string[] = [];

    for (const item of result.trace) {
      if (item.passed === false) continue;
      if (item.type === NODE_TYPE_GUARD && item.reason) {
        keyMilestones.push(item.name ? `门禁[${item.name}]通过` : '门禁通过');
      }
    }

    const milestoneText =
      keyMilestones.length > 0
        ? keyMilestones.join(MILESTONE_JOINER) + MILESTONE_SUFFIX
        : '';
    const actionText =
      result.action === DECISION_ACTIONS.BUY ? '触发买入信号' : '触发卖出信号';
    const tagText = result.signalTag ? ` [${result.signalTag}]` : '';

    return `${milestoneText}${actionText}${tagText}`;
  }
}
