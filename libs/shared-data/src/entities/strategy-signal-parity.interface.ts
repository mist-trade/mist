import type { DataSource } from '../enums/data-source.enum';
import type { Period } from '../enums/period.enum';
import type { StrategySignalKind } from '../enums/strategy-signal-kind.enum';
import type { StrategySignalSource } from '../enums/strategy-signal-source.enum';

/**
 * 实时信号与回测信号结果的统一同构数据契约接口。
 * 强制 StrategySignal 与 BacktestSignalResult 在实体层面 100% 对齐。
 */
export interface StrategySignalParityRecord {
  securityId?: number | null;
  securityCode?: string;
  strategyDefinitionId?: number | null;
  strategyVersionId?: number | null;
  period?: Period | null;
  source?: DataSource | null;
  signalTime: Date;
  pivotTime?: Date | null;
  signalType: string;
  signalKind: StrategySignalKind;
  signalSource: StrategySignalSource;
  confidence?: number | null;
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  contextSnapshot: Record<string, unknown>;
  decisionTrace?: Record<string, unknown> | null;
  ruleSnapshot: Record<string, unknown>;
  createdAt: Date;
}
