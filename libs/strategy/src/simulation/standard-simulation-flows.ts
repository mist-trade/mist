import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';
import type { ChanFourQuadrantTactics } from '../tactics/contracts/chan-four-quadrant-tactics.interface';
import { DynamicTacticsLoader } from '../tactics/dynamic-tactics-loader';

export interface ChanBspFlowOptions {
  readonly units?: 'bi' | 'duan';
  readonly direction?: 'buy' | 'sell' | 'both';
  readonly points?: {
    readonly first?: boolean;
    readonly second?: boolean;
    readonly third?: boolean;
  };
  readonly requiredBarCount?: number;
  readonly deduplicate?: boolean;
}

/**
 * 构造标准缠论买卖点决策流树
 * 彻底消除孤立硬编码的 chan_bsp 旁路，所有买卖点均作为策略树标准节点求值
 */
export function createChanBspDecisionFlow(
  options?: ChanBspFlowOptions,
): DecisionFlowNode {
  const units = options?.units ?? 'bi';
  const direction = options?.direction ?? 'both';
  const points = {
    first: options?.points?.first ?? true,
    second: options?.points?.second ?? true,
    third: options?.points?.third ?? true,
  };
  const requiredBarCount = options?.requiredBarCount ?? 60;
  const deduplicate = options?.deduplicate ?? true;

  const requiredAction =
    direction === 'both' ? 'BOTH' : direction === 'sell' ? 'SELL' : 'BUY';
  const terminalAction =
    direction === 'both' ? 'INHERIT' : direction === 'sell' ? 'SELL' : 'BUY';

  return {
    id: 'guard_chan_bsp',
    type: 'GUARD',
    name: '缠论形态买卖点标准门禁',
    pluginId: 'plugin.chan.bsp',
    params: {
      units,
      direction,
      points,
      requiredBarCount,
      deduplicate,
    },
    requiredAction,
    minConfidence: 0.6,
    onPass: {
      id: 'term_chan_bsp_passed',
      type: 'TERMINAL',
      action: terminalAction,
      signalTag: 'CHAN_BSP',
      reason: '缠论结构确立，触发买卖点信号',
    },
    onFail: {
      id: 'term_chan_bsp_rejected',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '未满足缠论买卖点形态确认条件',
    },
  };
}

/**
 * 构造四象限私有战术决策流树
 * 将动态加载的四象限战术与缠论买卖点无缝融合进同一棵决策流树
 */
export function createTacticsDecisionFlow(
  tactics: ChanFourQuadrantTactics = DynamicTacticsLoader.getTactics(),
): DecisionFlowNode {
  return {
    id: 'guard_tactics_chan_bsp',
    type: 'GUARD',
    name: `四象限战术门禁 [${tactics.name} v${tactics.version}]`,
    pluginId: 'plugin.chan.bsp',
    params: {
      units: 'bi',
      direction: 'both',
      points: { first: true, second: true, third: true },
      requiredBarCount: 60,
      deduplicate: true,
    },
    requiredAction: 'BOTH',
    minConfidence: 0.5,
    onPass: {
      id: 'term_tactics_signal',
      type: 'TERMINAL',
      action: 'INHERIT',
      signalTag: 'TACTICS_SIGNAL',
      reason: `满足四象限战术 [${tactics.name}] 触发条件`,
    },
    onFail: {
      id: 'term_tactics_abort',
      type: 'TERMINAL',
      action: 'ABORT',
      reason: '未达四象限战术触发标准',
    },
  };
}
