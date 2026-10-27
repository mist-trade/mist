import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategyKind } from '../enums/strategy-kind.enum';
import { BacktestRunStatus } from '../enums/backtest-run-status.enum';
import { BacktestSignalResult } from './backtest-signal-result.entity';
import { BacktestTradeResult } from './backtest-trade-result.entity';
import { StrategyDefinition } from './strategy-definition.entity';
import { StrategyVersion } from './strategy-version.entity';
import type { BacktestTargetIssue } from '../backtest-target-issue';

export interface BacktestNavPoint {
  readonly date: string;
  readonly totalEquity: number;
  readonly cash?: number;
  readonly marketValue?: number;
}

@Entity({ name: 'backtest_runs' })
export class BacktestRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'strategy_definition_id', type: 'int' })
  strategyDefinitionId: number = 0;

  @ManyToOne(() => StrategyDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategy_definition_id' })
  strategyDefinition!: StrategyDefinition;

  @Column({ name: 'strategy_version_id', type: 'int' })
  strategyVersionId: number = 0;

  @ManyToOne(() => StrategyVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategy_version_id' })
  strategyVersion!: StrategyVersion;

  @Column({ name: 'target_universe', type: 'json' })
  targetUniverse: string[] = [];

  @Column({ name: 'target_issues', type: 'json', default: () => "('[]')" })
  targetIssues: BacktestTargetIssue[] = [];

  @Column({ type: 'int' })
  period: Period = Period.DAY;

  @Column({ type: 'enum', enum: DataSource })
  source: DataSource = DataSource.EAST_MONEY;

  @Column({
    name: 'data_policy_version',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '拼接策略版本；canonical 回测必填，旧 run 为空',
  })
  dataPolicyVersion?: string | null;

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

  @Column({ type: 'enum', enum: StrategyKind, default: StrategyKind.RULE_DSL })
  kind: StrategyKind = StrategyKind.RULE_DSL;

  @Column({ name: 'signal_count', type: 'int', default: 0 })
  signalCount: number = 0;

  @Column({ name: 'matched_security_count', type: 'int', default: 0 })
  matchedSecurityCount: number = 0;

  @Column({
    name: 'total_return',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  totalReturn?: number | null;

  @Column({
    name: 'annualized_return',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  annualizedReturn?: number | null;

  @Column({
    name: 'max_drawdown',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  maxDrawdown?: number | null;

  @Column({
    name: 'max_underwater_duration',
    type: 'int',
    nullable: true,
  })
  maxUnderwaterDuration?: number | null;

  @Column({
    name: 'sharpe_ratio',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  sharpeRatio?: number | null;

  @Column({
    name: 'calmar_ratio',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  calmarRatio?: number | null;

  @Column({
    name: 'win_rate',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  winRate?: number | null;

  @Column({
    name: 'profit_loss_ratio',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  profitLossRatio?: number | null;

  @Column({ name: 'trade_count', type: 'int', default: 0 })
  tradeCount: number = 0;

  @Column({ name: 'nav_series', type: 'json', nullable: true })
  navSeries?: BacktestNavPoint[] | null;

  @Column({
    name: 'benchmark_code',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  benchmarkCode?: string | null;

  @Column({ name: 'parent_run_id', type: 'int', nullable: true })
  parentRunId?: number | null;

  @ManyToOne(() => BacktestRun, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_run_id' })
  parentRun?: BacktestRun | null;

  @Column({ name: 'suite_id', type: 'varchar', length: 64, nullable: true })
  suiteId?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  stage?: string | null;

  @Column({ name: 'scenario_id', type: 'varchar', length: 64, nullable: true })
  scenarioId?: string | null;

  @Column({ name: 'context_snapshot', type: 'json', nullable: true })
  contextSnapshot?: Record<string, unknown> | null;

  @Column({
    name: 'prewarm_status',
    type: 'enum',
    enum: ['full', 'partial', 'empty'],
    nullable: true,
  })
  prewarmStatus?: 'full' | 'partial' | 'empty' | null;

  @Column({ name: 'prewarm_min_actual', type: 'int', nullable: true })
  prewarmMinActual?: number | null;

  @Column({ name: 'prewarm_min_expected', type: 'int', nullable: true })
  prewarmMinExpected?: number | null;

  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @OneToMany(() => BacktestSignalResult, (result) => result.backtestRun)
  signalResults!: BacktestSignalResult[];

  @OneToMany(() => BacktestTradeResult, (trade) => trade.backtestRun)
  tradeResults!: BacktestTradeResult[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
