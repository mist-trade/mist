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
  readonly signalTime: string;
  readonly signalType: string;
  readonly badgeText: string;
  readonly triggerPrice: number;
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
  readonly signals: readonly SimulationSignal[];
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
