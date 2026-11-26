export {
  LI_PER_YUAN,
  divHalfUp,
  liToYuan,
  applyRatioLi,
  yuanToLi,
} from './money';
export type { Li } from './money';
export { applySlippageLi, calculateExecutionFeesLi } from './fees';
export { MarketRiskRegime } from './domain.types';
export type { FeeConfigLi, FeeDetailsLi } from './fees';
export type {
  AccountSnapshot,
  AttributedSignal,
  MacroRegimeSnapshot,
  Rule,
  RuleContext,
  SignalAttribution,
  SignalContributor,
  SizingContext,
  SizingResult,
  SizingStrategy,
  SignalGroupInput,
  TradeAction,
  TradeInstruction,
  TradeRejection,
  TradeRejectionReason,
  TradingDecision,
  TradingPositionState,
  Verdict,
} from './domain.types';
export {
  buildOfflineSignalIdempotencyKey,
  compareContributorOrder,
  consolidateGroupByDirection,
  isPositiveBase10IntegerKey,
  toSignalContributor,
} from './consolidation';
export type { ConsolidatedDirectionBuckets } from './consolidation';
export { createAllInWithBuffer } from './sizing';
export {
  createDefaultEntryRules,
  createDefaultExitRules,
  createDefaultRiskRules,
  createEntrySizingRule,
  entryHoldingGate,
  entryPriceGate,
  entryRegimeGate,
  exitSignalRule,
  fallbackRejectionRule,
  firstRiskVerdict,
  firstVerdict,
  riskSystemicCrunchRule,
} from './rules';
export type { RiskRule, RiskRuleContext, RiskVerdict } from './rules';
export { TradingEngine } from './engine';
export type { TradingEngineDeps } from './engine';
export type {
  VirtualFillEvent,
  VirtualFillLogPort,
  VirtualFillSide,
} from './fill-log.port';
export { foldVirtualFills } from './account-fold';
export { groupSignals } from './grouping';
export type {
  GroupableSignal,
  SignalGroup,
  SignalGroupDescriptor,
} from './grouping';
export {
  buildTradingManual,
  formatPeriod,
  formatYuan,
  renderTraceChainOf,
} from './manual';
export type { TradingManualInput } from './manual';
export type {
  GoldenScenario,
  GoldenEvent,
  GoldenGroupEvent,
  GoldenSignalSpec,
  GoldenSurveilEvent,
  SerializedLogEntry,
} from './golden';
export { runGoldenScenario, serializeAccount } from './golden';
export {
  ORDER_SIDES,
  ORDER_TYPES,
  ORDER_STATUSES,
  TRADING_LAYER_DEFAULTS,
} from '../strategy.constants';
