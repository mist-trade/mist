/**
 * 账本 fold（REQ-LEDGER-01）：virtual_fill_events（或内存日志）→ AccountSnapshot。
 *
 * 纯函数、整数厘算术；记账公式与 PositionStateMachine（加权成本/费用分摊/
 * 已实现盈亏）逐行对应——事件日志是唯一事实源，fold 是其确定性投影。
 * T+1：BUY 事件以 tradingDay 构造 entryTime（上海日界），使
 * isEnteredToday 与快照 tradingDay 的比较精确成立。
 */
import { formatShanghaiDateString } from '@app/timezone';
import { ORDER_SIDES } from '../strategy.constants';
import type { AccountSnapshot, TradingPositionState } from './domain.types';
import type { VirtualFillEvent } from './fill-log.port';
import type { Li } from './money';

/** 上海日界的交易日至 → Date（供 entryTime/isEnteredToday 比较）。 */
function tradingDayToDate(tradingDay: string | Date): Date {
  const dayStr =
    tradingDay instanceof Date
      ? formatShanghaiDateString(tradingDay)
      : String(tradingDay).slice(0, 10);
  return new Date(`${dayStr}T00:00:00+08:00`);
}

interface MutableFoldPosition {
  securityId: number;
  securityCode: string;
  holdingQuantity: number;
  costPriceLi: Li;
  entryTime?: Date;
  currentPriceLi: Li;
  realizedPnlLi: Li;
  accumulatedBuyFeesLi: Li;
}

export interface VirtualFillAccumulator {
  apply(event: VirtualFillEvent): void;
  snapshot(tradingDay?: string): AccountSnapshot;
}

/**
 * 创建增量账本累加器（O(1) 单条推进，供管线门面避免 O(G * F) 重复全量 fold）。
 */
export function createVirtualFillAccumulator(
  seedCapitalLi: bigint,
  initialTradingDay = '',
): VirtualFillAccumulator {
  let cashLi: Li = seedCapitalLi;
  let lastTradingDay = initialTradingDay;
  const positions = new Map<number, MutableFoldPosition>();

  const apply = (event: VirtualFillEvent): void => {
    lastTradingDay = event.tradingDay;
    cashLi += event.netAmountLi;
    const turnoverLi = event.priceLi * BigInt(event.quantity);

    if (event.side === ORDER_SIDES.BUY) {
      let pos = positions.get(event.securityId);
      if (pos === undefined) {
        pos = {
          securityId: event.securityId,
          securityCode: event.securityCode,
          holdingQuantity: 0,
          costPriceLi: 0n,
          entryTime: undefined,
          currentPriceLi: 0n,
          realizedPnlLi: 0n,
          accumulatedBuyFeesLi: 0n,
        };
        positions.set(event.securityId, pos);
      }
      // 对应状态机：EMPTY/CLOSED 状态收到买入 → 重置入场时刻与费用累计
      //（realizedPnl 为跨回合累计，不重置）
      if (pos.holdingQuantity <= 0) {
        pos.entryTime = tradingDayToDate(event.tradingDay);
        pos.accumulatedBuyFeesLi = 0n;
        pos.costPriceLi = 0n;
      }
      const prevCostTotalLi = BigInt(pos.holdingQuantity) * pos.costPriceLi;
      pos.holdingQuantity += event.quantity;
      pos.costPriceLi =
        pos.holdingQuantity > 0
          ? (prevCostTotalLi + turnoverLi) / BigInt(pos.holdingQuantity)
          : 0n;
      pos.accumulatedBuyFeesLi += event.feesLi;
      pos.currentPriceLi = event.priceLi;
    } else {
      const pos = positions.get(event.securityId);
      if (pos === undefined || pos.holdingQuantity <= 0) return;

      const fillQty = Math.min(pos.holdingQuantity, event.quantity);
      const costBasisLi = pos.costPriceLi * BigInt(fillQty);
      const allocatedBuyFeesLi =
        pos.holdingQuantity > 0
          ? (pos.accumulatedBuyFeesLi * BigInt(fillQty)) /
            BigInt(pos.holdingQuantity)
          : 0n;
      const netProceedsLi = turnoverLi - event.feesLi;
      pos.realizedPnlLi += netProceedsLi - costBasisLi - allocatedBuyFeesLi;
      pos.accumulatedBuyFeesLi -= allocatedBuyFeesLi;
      if (pos.accumulatedBuyFeesLi < 0n) pos.accumulatedBuyFeesLi = 0n;
      pos.holdingQuantity -= fillQty;
      pos.currentPriceLi = event.priceLi;
      // 对应状态机：全部平仓 → 重置成本/费用/入场时刻
      if (pos.holdingQuantity <= 0) {
        pos.holdingQuantity = 0;
        pos.costPriceLi = 0n;
        pos.accumulatedBuyFeesLi = 0n;
        pos.entryTime = undefined;
      }
    }
  };

  const snapshot = (tradingDay?: string): AccountSnapshot => {
    const projected = new Map<number, TradingPositionState>();
    for (const [id, pos] of positions) {
      if (pos.holdingQuantity <= 0) continue;
      projected.set(id, {
        securityId: pos.securityId,
        securityCode: pos.securityCode,
        holdingQuantity: pos.holdingQuantity,
        costPriceLi: pos.costPriceLi,
        entryTime: pos.entryTime,
        currentPriceLi: pos.currentPriceLi,
        realizedPnlLi: pos.realizedPnlLi,
        accumulatedBuyFeesLi: pos.accumulatedBuyFeesLi,
      });
    }

    return {
      cashLi,
      positions: projected,
      tradingDay: tradingDay ?? lastTradingDay,
    };
  };

  return { apply, snapshot };
}

/**
 * 依序 fold fill 事件重建账户快照。
 *
 * @param events 按 id 序（追加序）的全部 fill 事件
 * @param seedCapitalLi 种子资金（整数厘）
 * @param currentTradingDay 快照所在交易日（T+1 判定基准）
 */
export function foldVirtualFills(
  events: readonly VirtualFillEvent[],
  seedCapitalLi: bigint,
  currentTradingDay: string,
): AccountSnapshot {
  const accumulator = createVirtualFillAccumulator(
    seedCapitalLi,
    currentTradingDay,
  );
  for (const event of events) {
    accumulator.apply(event);
  }
  return accumulator.snapshot(currentTradingDay);
}
