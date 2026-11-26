/**
 * 账本持久化端口（REQ-ADAPT-04）：域核心定义、app 层实现。
 *
 * 事件溯源单一事实源（REQ-LEDGER-01）：成交事实的唯一权威载体是追加日志；
 * 账户快照必须可由日志 fold 完整重建。幂等锚点 unique（REQ-LEDGER-03）：
 * 同一告警事件至多产生一条 fill。
 */
import { ORDER_SIDES } from '../strategy.constants';
import type { Li } from './money';

export type VirtualFillSide = (typeof ORDER_SIDES)[keyof typeof ORDER_SIDES];

export interface VirtualFillEvent {
  /** 幂等锚点：实时 = alertEventId 字符串化；离线 = 合成幂等串（REQ-FACADE-04） */
  readonly idempotencyKey: string;
  readonly securityId: number;
  readonly securityCode: string;
  readonly side: VirtualFillSide;
  readonly quantity: number;
  /** 成交价（整数厘） */
  readonly priceLi: Li;
  /** 规费合计（整数厘） */
  readonly feesLi: Li;
  /** 带符号净额（买入为负、卖出为正，整数厘） */
  readonly netAmountLi: Li;
  /** 交易日至（YYYY-MM-DD） */
  readonly tradingDay: string;
  /** 成交发生时刻（与指令有效时刻对齐） */
  readonly fillTime?: Date | undefined;
  /** 产出该成交的指令（审计快照，可选） */
  readonly instruction?:
    | {
        readonly instructionId: string;
        readonly action: string;
        readonly reason: string;
        readonly strategyName: string;
        readonly periodLabel: string;
        readonly contributorKeys?: readonly string[];
        readonly contributorsSummary?: string;
      }
    | undefined;
}

export interface VirtualFillLogPort {
  /** 追加成交事实（幂等：重复锚点必须 no-op 或抛错，由实现决定并文档化） */
  append(event: VirtualFillEvent): Promise<void>;
  /** 按 id 序加载，供 fold 重建账户快照 */
  loadBySecurity(securityId: number): Promise<readonly VirtualFillEvent[]>;
}
