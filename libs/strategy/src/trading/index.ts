export {
  LI_PER_YUAN,
  divHalfUp,
  liToYuan,
  applyRatioLi,
  yuanToLi,
} from './money';
export type { Li } from './money';
export { applySlippageLi, calculateExecutionFeesLi } from './fees';
export type { FeeConfigLi, FeeDetailsLi } from './fees';
// 注：MarketRiskRegime / MacroRegimeSnapshot 暂由 execution/index 导出（旧 Arbiter
// 文件）；组 4 迁移消费端、组 9 退役 Arbiter 后翻转为本模块导出，避免 barrel 冲突。
export type {
  AccountSnapshot,
  AttributedSignal,
  Rule,
  RuleContext,
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
export { sellFirstByConfidence } from './ordering';
export type { GroupOrderingStrategy } from './ordering';
export { createAllInWithBuffer } from './sizing';
export {
  createDefaultEntryRules,
  createDefaultExitRules,
  createDefaultRiskRules,
  createEntrySizingRule,
  createRiskHardStopRule,
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
