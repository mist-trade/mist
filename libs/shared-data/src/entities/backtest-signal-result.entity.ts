import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategySignalKind } from '../enums/strategy-signal-kind.enum';
import { StrategySignalSource } from '../enums/strategy-signal-source.enum';
import { BacktestRun } from './backtest-run.entity';
import { Security } from './security.entity';
import type { StrategySignalParityRecord } from './strategy-signal-parity.interface';

@Entity({ name: 'backtest_signal_results' })
@Index('idx_backtest_signal_results_run_time_id', [
  'backtestRunId',
  'signalTime',
  'id',
])
export class BacktestSignalResult implements StrategySignalParityRecord {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @ManyToOne(() => BacktestRun, (run) => run.signalResults, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'backtest_run_id' })
  backtestRun!: BacktestRun;

  @Column({ name: 'security_id', type: 'int', nullable: true })
  securityId?: number | null;

  @ManyToOne(() => Security, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'RESTRICT',
  })
  @JoinColumn({
    name: 'security_id',
    foreignKeyConstraintName: 'fk_backtest_signal_results_security',
  })
  security?: Security | null;

  @Column({ name: 'strategy_definition_id', type: 'int', nullable: true })
  strategyDefinitionId?: number | null;

  @Column({ name: 'strategy_version_id', type: 'int', nullable: true })
  strategyVersionId?: number | null;

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

  @Column({ type: 'int', nullable: true })
  period?: Period | null;

  @Column({ type: 'enum', enum: DataSource, nullable: true })
  source?: DataSource | null;

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
    name: 'signal_kind',
    type: 'enum',
    enum: StrategySignalKind,
    default: StrategySignalKind.ENTRY,
  })
  signalKind: StrategySignalKind = StrategySignalKind.ENTRY;

  @Column({
    name: 'signal_source',
    type: 'enum',
    enum: StrategySignalSource,
    default: StrategySignalSource.BACKTEST,
  })
  signalSource: StrategySignalSource = StrategySignalSource.BACKTEST;

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
