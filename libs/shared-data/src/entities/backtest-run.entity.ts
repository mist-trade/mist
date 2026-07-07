import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { BacktestRunStatus } from '../enums/backtest-run-status.enum';

@Entity({ name: 'backtest_runs' })
export class BacktestRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'strategy_definition_id', type: 'int' })
  strategyDefinitionId: number = 0;

  @Column({ name: 'strategy_version_id', type: 'int' })
  strategyVersionId: number = 0;

  @Column({ name: 'target_universe', type: 'json' })
  targetUniverse: string[] = [];

  @Column({ type: 'int' })
  period: Period = Period.DAY;

  @Column({ type: 'enum', enum: DataSource })
  source: DataSource = DataSource.EAST_MONEY;

  @Column({ name: 'start_date', type: 'datetime' })
  startDate: Date = new Date();

  @Column({ name: 'end_date', type: 'datetime' })
  endDate: Date = new Date();

  @Column({
    type: 'enum',
    enum: BacktestRunStatus,
    default: BacktestRunStatus.PENDING,
  })
  status: BacktestRunStatus = BacktestRunStatus.PENDING;

  @Column({ name: 'signal_count', type: 'int', default: 0 })
  signalCount: number = 0;

  @Column({ name: 'matched_security_count', type: 'int', default: 0 })
  matchedSecurityCount: number = 0;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updateTime!: Date;
}
