import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 交易层事件溯源虚拟账本（REQ-LEDGER-01/03，migration 037）。
 *
 * 追加日志即单一事实源：账户快照 = fold(事件)。金额列 BIGINT 厘
 * （1 元 = 1000 厘，REQ-ENGINE-07）；price DECIMAL(10,3) 为元（A 股 ≤3 位
 * 小数精确）。unique(alert_event_id) 幂等锚点：同一告警事件至多一条 fill。
 * 域内幂等键为字符串（实时 = alertEventId 字符串化）；本表仅承载实时路径。
 */
@Entity({ name: 'virtual_fill_events' })
@Index('uq_virtual_fill_events_alert_event_id', ['alertEventId'], {
  unique: true,
})
@Index('idx_virtual_fill_events_security_day', ['securityId', 'tradingDay'])
export class VirtualFillEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'alert_event_id', type: 'bigint' })
  alertEventId!: string;

  @Column({ name: 'security_id', type: 'int' })
  securityId!: number;

  @Column({ name: 'security_code', type: 'varchar', length: 32 })
  securityCode!: string;

  @Column({ type: 'enum', enum: ['BUY', 'SELL'] })
  side!: 'BUY' | 'SELL';

  @Column({ type: 'int' })
  quantity!: number;

  /** 成交价（元，DECIMAL(10,3)） */
  @Column({ type: 'decimal', precision: 10, scale: 3 })
  price!: string;

  /** 规费合计（整数厘） */
  @Column({ type: 'bigint' })
  fees!: string;

  /** 带符号净额（买入为负、卖出为正，整数厘） */
  @Column({ name: 'net_amount', type: 'bigint' })
  netAmount!: string;

  /** 交易日至（YYYY-MM-DD，T+1 判定与巡检依据） */
  @Column({ name: 'trading_day', type: 'date' })
  tradingDay!: string;

  /** 产出该成交的指令审计快照（可选；json 列以 unknown 承载，读侧自行收窄） */
  @Column({ type: 'json', nullable: true })
  instruction?: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
