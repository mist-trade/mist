/**
 * 交易手册渲染的 app 层适配桥（REQ-FACADE-05：渲染器归 libs/strategy，
 * 本模块仅做 StrategySignal 实体 → trace 容器的桥接，保持渲染单一实现）。
 */
export {
  buildTradingManual,
  formatPeriod,
  formatYuan,
  renderTraceChainOf,
} from '@app/strategy';
import { renderTraceChainOf } from '@app/strategy';
import type { StrategySignal } from '@app/shared-data';

/** 实体桥：StrategySignal.decisionTrace → 紧凑 trace 链。 */
export function renderTraceChain(signal: StrategySignal | null): string | null {
  return renderTraceChainOf(signal?.decisionTrace ?? null);
}
