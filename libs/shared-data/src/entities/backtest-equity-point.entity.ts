import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity({ name: 'backtest_equity_points' })
@Unique(['backtestRunId', 'pointTime'])
export class BacktestEquityPoint {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @Column({ name: 'point_time', type: 'datetime' })
  pointTime: Date = new Date();

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  cash: number = 0;

  @Column({ name: 'market_value', type: 'decimal', precision: 20, scale: 2 })
  marketValue: number = 0;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  equity: number = 0;

  @Column({
    name: 'benchmark_value',
    type: 'decimal',
    precision: 20,
    scale: 2,
    nullable: true,
  })
  benchmarkValue?: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 8, default: 0 })
  drawdown: number = 0;

  @Column({ type: 'decimal', precision: 12, scale: 8, default: 0 })
  exposure: number = 0;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;
}
