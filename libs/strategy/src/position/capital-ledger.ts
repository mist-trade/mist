import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
import type { OrderFilledEvent } from '../execution/execution.types';
import {
  DEFAULT_BROKER_INITIAL_CASH,
  POSITION_DECIMAL_PLACES,
} from '../strategy.constants';
import type { DailyNavSnapshot, PositionSnapshot } from './position.types';

export interface CapitalLedgerOptions {
  /** 初始可用资金，默认 1,000,000 */
  readonly initialCash?: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 资金与净值账本。
 *
 * 资金不属于任何持仓状态机：`PositionStateMachine` 只记数量、成本与已实现盈亏，
 * 现金流转与净值曲线由本账本统一承担。当前实现为「单一 sleeve」
 * （回测中每个标的 / 未来每个通道一份），通道拆分后可直接提升为组合级。
 */
export class CapitalLedger {
  private cash: number;
  private readonly navHistory: DailyNavSnapshot[] = [];

  constructor(options?: CapitalLedgerOptions) {
    this.cash = options?.initialCash ?? DEFAULT_BROKER_INITIAL_CASH;
  }

  getCash(): number {
    return this.cash;
  }

  /** 成交现金流记账：`netAmount` 为带符号净额（买入为负、卖出为正）。 */
  applyFill(event: OrderFilledEvent): void {
    this.cash = round2(this.cash + event.netAmount);
  }

  /** 日切净值快照：总权益 = 现金 + 持仓市值。 */
  onDayClose(
    bar: StrategyBar,
    position: Readonly<PositionSnapshot>,
  ): DailyNavSnapshot {
    const marketValue = round2(position.holdingQuantity * bar.close);
    const totalEquity = round2(this.cash + marketValue);
    const previous = this.navHistory.at(-1);
    const prevEquity = previous ? previous.totalEquity : totalEquity;
    const dailyReturn =
      prevEquity > 0
        ? Math.round(
            ((totalEquity - prevEquity) / prevEquity) *
              POSITION_DECIMAL_PLACES.RATIO_SCALE,
          ) / POSITION_DECIMAL_PLACES.RATIO_SCALE
        : 0;

    const snapshot: DailyNavSnapshot = {
      date: formatShanghaiDateString(bar.timestamp),
      securityCode: position.securityCode,
      closePrice: bar.close,
      holdingQuantity: position.holdingQuantity,
      marketValue,
      cash: this.cash,
      totalEquity,
      dailyReturn,
    };
    this.navHistory.push(snapshot);
    return snapshot;
  }

  getNavHistory(): readonly DailyNavSnapshot[] {
    return this.navHistory;
  }
}
