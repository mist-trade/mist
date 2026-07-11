import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { BacktestTradeStatus } from '../enums/backtest-trade-status.enum';

@Entity({ name: 'backtest_trades' })
@Unique(['entryOrderId'])
export class BacktestTrade {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

  @Column({
    type: 'enum',
    enum: BacktestTradeStatus,
    default: BacktestTradeStatus.OPEN,
  })
  status: BacktestTradeStatus = BacktestTradeStatus.OPEN;

  @Column({ name: 'entry_order_id', type: 'int' })
  entryOrderId: number = 0;

  @Column({ name: 'exit_order_id', type: 'int', nullable: true })
  exitOrderId?: number | null;

  @Column({ name: 'entry_time', type: 'datetime' })
  entryTime: Date = new Date();

  @Column({ name: 'exit_time', type: 'datetime', nullable: true })
  exitTime?: Date | null;

  @Column({ name: 'entry_price', type: 'decimal', precision: 20, scale: 2 })
  entryPrice: number = 0;

  @Column({
    name: 'exit_price',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  exitPrice?: number | null;

  @Column({ type: 'int' })
  quantity: number = 0;

  @Column({
    name: 'entry_fee',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  entryFee: number = 0;

  @Column({
    name: 'exit_fee',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  exitFee: number = 0;

  @Column({
    name: 'realized_pnl',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  realizedPnl?: number | null;

  @Column({ name: 'holding_days', type: 'int', nullable: true })
  holdingDays?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updateTime!: Date;
}
