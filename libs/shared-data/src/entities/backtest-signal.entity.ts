import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategySignalKind } from '../enums/strategy-signal-kind.enum';

@Entity({ name: 'backtest_signals' })
@Unique(['backtestRunId', 'securityCode', 'signalTime', 'signalKind'])
export class BacktestSignal {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'backtest_run_id', type: 'int' })
  backtestRunId: number = 0;

  @Column({ name: 'strategy_definition_id', type: 'int' })
  strategyDefinitionId: number = 0;

  @Column({ name: 'strategy_version_id', type: 'int' })
  strategyVersionId: number = 0;

  @Column({ name: 'security_code', type: 'varchar', length: 20 })
  securityCode: string = '';

  @Column({ type: 'int' })
  period: Period = Period.DAY;

  @Column({ type: 'enum', enum: DataSource })
  source: DataSource = DataSource.EAST_MONEY;

  @Column({
    name: 'signal_kind',
    type: 'enum',
    enum: StrategySignalKind,
    default: StrategySignalKind.ENTRY,
  })
  signalKind: StrategySignalKind = StrategySignalKind.ENTRY;

  @Column({ name: 'signal_time', type: 'datetime' })
  signalTime: Date = new Date();

  @Column({ name: 'context_snapshot', type: 'json', nullable: true })
  contextSnapshot?: Record<string, unknown> | null;

  @Column({ name: 'rule_snapshot', type: 'json', nullable: true })
  ruleSnapshot?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;
}
