import type {
  ProjectedStrategyBar,
  StrategyBar,
  StrategyMarketSource,
} from '@app/market-data';
import type { DecisionFlowNode } from '../decision-flow/decision-flow.types';

export type SimulationSessionStatus =
  | 'idle'
  | 'playing'
  | 'paused'
  | 'completed';

export interface SimulationSignal {
  /** 决策触发时刻 (ISO 字符串) = currentBar.timestamp (右侧闭合确立，用于交易撮合与单调推进) */
  readonly signalTime: string;
  /** 显式声明的决策触发时刻 (与 signalTime 严格等价) */
  readonly triggerTime: string;
  /** 形态几何极值时刻 (ISO 字符串) = cand.pivotTime || cand.time (用于图表锚点与结构归因) */
  readonly pivotTime: string;
  /** 决策触发时刻收盘市价 (虚拟撮合基准价) */
  readonly triggerPrice: number;
  /** 形态几何极值点价格 (止损参考基准价) */
  readonly pivotPrice: number;
  readonly signalType: string;
  readonly badgeText: string;
  readonly isBuy: boolean;
  readonly confidence: number;
  readonly decisionTrace: Record<string, unknown> | null;
  readonly securityCode: string;
  readonly period: number;
}

export interface SimulationFrame {
  readonly sessionId: string;
  readonly cursor: number;
  readonly total: number;
  readonly bar: StrategyBar;
  readonly windowBars: readonly ProjectedStrategyBar[];
  /** 截至当前帧已累积的所有有效信号 (Accumulated signals up to this cursor) */
  readonly signals: readonly SimulationSignal[];
  /** 仅当前单帧新触发的增量信号 (Delta signals of this frame) */
  readonly latestSignals?: readonly SimulationSignal[];
  readonly status: SimulationSessionStatus;
}

export interface SimulationSessionConfig {
  readonly sessionId?: string;
  readonly securityId?: number;
  readonly securityCode: string;
  readonly period: number;
  readonly source?: StrategyMarketSource;
  readonly startDate?: string | Date;
  readonly endDate?: string | Date;
  readonly filterFenxingContainment?: boolean;
  readonly flow: DecisionFlowNode;
  readonly windowBudget?: number;
}

export type SimulationControlAction =
  | 'play'
  | 'pause'
  | 'step_next'
  | 'step_prev'
  | 'seek'
  | 'set_speed';

export interface SimulationControlCommand {
  readonly action: SimulationControlAction;
  readonly param?: number; // 目标索引 (用于 seek)，或间隔毫秒 (用于 set_speed)
}

export interface SimulationSessionSummary {
  readonly sessionId: string;
  readonly securityCode: string;
  readonly period: number;
  readonly totalBars: number;
  readonly preWarmBars: number;
  readonly currentCursor: number;
  readonly status: SimulationSessionStatus;
  readonly speedMs: number;
}

export interface SimulationQueueBarDump {
  readonly time: string;
  readonly ohlc: {
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
  } | null;
  readonly volume: string | null;
  readonly amount: string | null;
  readonly resolution: string;
}

export interface SimulationStateDump {
  readonly sessionId: string;
  readonly securityCode: string;
  readonly period: number;
  readonly cursor: number;
  readonly totalBars: number;
  readonly preWarmBars: number;
  readonly currentBar: StrategyBar | null;
  readonly windowQueue: readonly SimulationQueueBarDump[];
  readonly signals: readonly SimulationSignal[];
  readonly latestFrameSignals: readonly SimulationSignal[];
}
