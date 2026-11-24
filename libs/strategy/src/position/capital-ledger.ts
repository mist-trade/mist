/**
 * 资金与净值账本（float 边界接口，整数厘内部算术）。
 *
 * 组 1b 移植（REQ-ENGINE-07）：资金不属于任何持仓状态机——
 * `PositionStateMachine` 只记数量、成本与已实现盈亏，现金流转与净值曲线
 * 由本账本统一承担。内部以整数厘运算（fold 语义零改动）。
 *
 * rehydrate（REQ-LEDGER-01）：账户快照可由 fill 事件流 fold 完整重建——
 * `fromFillEvents` 为实时虚拟账本（virtual_fill_events）提供同一入口。
 */
import type { StrategyBar } from '@app/market-data';
import { formatShanghaiDateString } from '@app/timezone';
import type { OrderFilledEvent } from '../execution/execution.types';
import {
  DEFAULT_BROKER_INITIAL_CASH,
  POSITION_DECIMAL_PLACES,
} from '../strategy.constants';
import { liToYuan, yuanToLi, type Li } from '../trading/money';
import type { DailyNavSnapshot, PositionSnapshot } from './position.types';

export interface CapitalLedgerOptions {
  /** 初始可用资金，默认 1,000,000 */
  readonly initialCash?: number;
}

/**
 * 资金与净值账本。当前实现为「单一 sleeve」（回测中每个标的 / 未来每个通道
 * 一份），通道拆分后可直接提升为组合级。
 */
export class CapitalLedger {
  private cashLi: Li;
  private readonly navHistory: DailyNavSnapshot[] = [];

  constructor(options?: CapitalLedgerOptions) {
    this.cashLi = yuanToLi(options?.initialCash ?? DEFAULT_BROKER_INITIAL_CASH);
  }

  /** 事件流重建（REQ-LEDGER-01）：依序 fold fill 事件（净额带符号）。 */
  static fromFillEvents(
    events: readonly Pick<OrderFilledEvent, 'netAmount'>[],
    initialCash?: number,
  ): CapitalLedger {
    const ledger = new CapitalLedger({ initialCash });
    for (const event of events) {
      ledger.applyFill(event);
    }
    return ledger;
  }

  getCash(): number {
    return liToYuan(this.cashLi);
  }

  getCashLi(): Li {
    return this.cashLi;
  }

  /** 成交现金流记账：`netAmount` 为带符号净额（买入为负、卖出为正）。 */
  applyFill(event: Pick<OrderFilledEvent, 'netAmount'>): void {
    this.cashLi += yuanToLi(event.netAmount);
  }

  /** 日切净值快照：总权益 = 现金 + 持仓市值。 */
  onDayClose(
    bar: StrategyBar,
    position: Readonly<PositionSnapshot>,
  ): DailyNavSnapshot {
    const marketValue =
      Math.round(position.holdingQuantity * bar.close * 100) / 100;
    const totalEquity =
      Math.round((liToYuan(this.cashLi) + marketValue) * 100) / 100;
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
      cash: liToYuan(this.cashLi),
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
