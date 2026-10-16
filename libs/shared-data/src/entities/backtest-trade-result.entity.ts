import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BacktestRun } from './backtest-run.entity';
import { Security } from './security.entity';

@Entity({ name: 'backtest_trade_results' })
@Index('idx_btr_run_security', ['backtestRunId', 'securityCode'])
@Index('idx_btr_entry_time', ['entryTime'])
export class BacktestTradeResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @ManyToOne(() => BacktestRun, (run) => run.tradeResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'backtest_run_id' })
  backtestRun!: BacktestRun;

  @Column({ name: 'security_id', type: 'int', nullable: true })
  securityId?: number | null;

  @ManyToOne(() => Security, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'security_id' })
  security?: Security | null;

  @Column({ name: 'security_code', type: 'varchar', length: 32 })
  securityCode: string = '';

  @Column({ name: 'entry_time', type: 'datetime' })
  entryTime: Date = new Date();

  @Column({ name: 'exit_time', type: 'datetime' })
  exitTime: Date = new Date();

  @Column({ name: 'holding_bars', type: 'int', default: 0 })
  holdingBars: number = 0;

  @Column({ name: 'entry_price', type: 'decimal', precision: 18, scale: 4 })
  entryPrice: number = 0;

  @Column({ name: 'exit_price', type: 'decimal', precision: 18, scale: 4 })
  exitPrice: number = 0;

  @Column({ type: 'int' })
  quantity: number = 0;

  @Column({ name: 'realized_pnl', type: 'decimal', precision: 18, scale: 4 })
  realizedPnl: number = 0;

  @Column({ name: 'return_ratio', type: 'decimal', precision: 10, scale: 4 })
  returnRatio: number = 0;

  @Column({
    name: 'exit_reason',
    type: 'varchar',
    length: 64,
    default: 'SIGNAL_EXIT',
  })
  exitReason: string = 'SIGNAL_EXIT';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
