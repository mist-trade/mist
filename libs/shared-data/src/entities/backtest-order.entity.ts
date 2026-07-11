import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BacktestOrderSide } from '../enums/backtest-order-side.enum';
import { BacktestOrderStatus } from '../enums/backtest-order-status.enum';

@Entity({ name: 'backtest_orders' })
@Unique(['backtestSignalId'])
export class BacktestOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @Column({ name: 'backtest_signal_id', type: 'int', nullable: true })
  backtestSignalId?: number | null;

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

  @Column({ type: 'enum', enum: BacktestOrderSide })
  side: BacktestOrderSide = BacktestOrderSide.BUY;

  @Column({
    type: 'enum',
    enum: BacktestOrderStatus,
    default: BacktestOrderStatus.PENDING,
  })
  status: BacktestOrderStatus = BacktestOrderStatus.PENDING;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason?: string | null;

  @Column({ name: 'scheduled_time', type: 'datetime' })
  scheduledTime: Date = new Date();

  @Column({ name: 'execution_time', type: 'datetime', nullable: true })
  executionTime?: Date | null;

  @Column({ name: 'expired_at', type: 'datetime', nullable: true })
  expiredAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  quantity: number = 0;

  @Column({
    name: 'fill_price',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  fillPrice?: number | null;

  @Column({
    name: 'gross_amount',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  grossAmount?: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  commission: number = 0;

  @Column({
    name: 'stamp_duty',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  stampDuty: number = 0;

  @Column({
    name: 'transfer_fee',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  transferFee: number = 0;

  @Column({
    name: 'total_fee',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  totalFee: number = 0;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;
}
