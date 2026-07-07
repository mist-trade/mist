import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DataSource } from '../enums/data-source.enum';
import { Period } from '../enums/period.enum';
import { StrategySignalSource } from '../enums/strategy-signal-source.enum';

@Entity({ name: 'strategy_signals' })
export class StrategySignal {
  @PrimaryGeneratedColumn()
  id!: number;

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

  @Column({ name: 'signal_time', type: 'datetime' })
  signalTime: Date = new Date();

  @Column({
    name: 'signal_source',
    type: 'enum',
    enum: StrategySignalSource,
  })
  signalSource: StrategySignalSource = StrategySignalSource.LIVE;

  @Column({ name: 'context_snapshot', type: 'json', nullable: true })
  contextSnapshot?: Record<string, unknown> | null;

  @Column({ name: 'rule_snapshot', type: 'json', nullable: true })
  ruleSnapshot?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createTime!: Date;
}
