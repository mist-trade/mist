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

@Entity({ name: 'backtest_signal_results' })
@Index('idx_backtest_signal_results_run_time_id', [
  'backtestRunId',
  'signalTime',
  'id',
])
export class BacktestSignalResult {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @ManyToOne(() => BacktestRun, (run) => run.signalResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'backtest_run_id' })
  backtestRun!: BacktestRun;

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

  @Column({ name: 'signal_time', type: 'datetime' })
  signalTime: Date = new Date();

  /**
   * 双时间戳契约：形态几何极值时刻（图表 Marker 定位用），无 pivot 语义为 NULL。
   * signal_time 保持决策触发（确认 Bar）语义；存量行由 migration 026 回填
   * pivot_time = signal_time（前端回退逻辑下 Marker 位置不变）。
   */
  @Column({ name: 'pivot_time', type: 'datetime', nullable: true })
  pivotTime?: Date | null;

  @Column({
    name: 'signal_type',
    type: 'varchar',
    length: 32,
    default: 'signal',
  })
  signalType: string = 'signal';

  @Column({
    name: 'confidence',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  confidence?: number | null;

  @Column({
    name: 'confidence_level',
    type: 'enum',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    nullable: true,
  })
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;

  @Column({ name: 'context_snapshot', type: 'json' })
  contextSnapshot!: Record<string, unknown>;

  @Column({ name: 'decision_trace', type: 'json', nullable: true })
  decisionTrace?: Record<string, unknown> | null;

  @Column({ name: 'rule_snapshot', type: 'json' })
  ruleSnapshot!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
