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
import { BacktestRunStage } from '../enums/backtest-run-stage.enum';

@Entity({ name: 'backtest_runs' })
export class BacktestRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'strategy_definition_id', type: 'int' })
  strategyDefinitionId: number = 0;

  @Column({ name: 'strategy_version_id', type: 'int' })
  strategyVersionId: number = 0;

  @Column({ name: 'strategy_snapshot', type: 'json' })
  strategySnapshot: Record<string, unknown> = {};

  @Column({ name: 'target_universe', type: 'json' })
  targetUniverse: string[] = [];

  @Column({ type: 'int' })
  period: Period = Period.DAY;

  // No default: a backtest run is always created with an explicit tdx/qmt
  // source via createRun, so a stale EAST_MONEY default would be misleading.
  @Column({ type: 'enum', enum: DataSource })
  source: DataSource;

  @Column({ name: 'config_snapshot', type: 'json' })
  configSnapshot: Record<string, unknown> = {};

  @Column({
    name: 'market_data_fingerprint',
    type: 'char',
    length: 64,
    charset: 'ascii',
    collation: 'ascii_bin',
    nullable: true,
  })
  marketDataFingerprint: string | null = null;

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

  @Column({
    type: 'enum',
    enum: BacktestRunStage,
    default: BacktestRunStage.QUEUED,
  })
  stage: BacktestRunStage = BacktestRunStage.QUEUED;

  @Column({ name: 'processed_work', type: 'int', default: 0 })
  processedWork: number = 0;

  @Column({ name: 'total_work', type: 'int', default: 0 })
  totalWork: number = 0;

  @Column({
    name: 'progress_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  progressPercent: number = 0;

  @Column({ name: 'lease_owner', type: 'varchar', length: 120, nullable: true })
  leaseOwner?: string | null;

  @Column({ name: 'lease_expires_at', type: 'datetime', nullable: true })
  leaseExpiresAt?: Date | null;

  @Column({ name: 'lease_heartbeat_at', type: 'datetime', nullable: true })
  leaseHeartbeatAt?: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number = 0;

  @Column({ name: 'cancel_requested_at', type: 'datetime', nullable: true })
  cancelRequestedAt?: Date | null;

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

  @Column({ type: 'json', nullable: true })
  metrics?: Record<string, unknown> | null;

  @Column({ name: 'error_code', type: 'varchar', length: 120, nullable: true })
  errorCode?: string | null;

  @Column({ name: 'error_details', type: 'json', nullable: true })
  errorDetails?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updateTime!: Date;
}
