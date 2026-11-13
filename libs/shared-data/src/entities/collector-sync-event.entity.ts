import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum CollectorSyncStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
}

export enum CollectorVerificationStatus {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

@Entity({ name: 'collector_sync_events' })
@Index('idx_sync_events_source_time', ['source', 'createdAt'])
@Index('idx_sync_events_security_period', ['securityId', 'period', 'createdAt'])
export class CollectorSyncEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  source!: string;

  @Column({ name: 'security_id', type: 'int', unsigned: true })
  securityId!: number;

  @Column({ type: 'varchar', length: 32 })
  symbol!: string;

  @Column({ type: 'varchar', length: 16 })
  period!: string;

  @Column({ name: 'bars_received', type: 'int', default: 0 })
  barsReceived!: number;

  @Column({ name: 'bars_saved', type: 'int', default: 0 })
  barsSaved!: number;

  @Column({ name: 'start_time', type: 'varchar', length: 32, nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'varchar', length: 32, nullable: true })
  endTime!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 32,
    default: CollectorVerificationStatus.PENDING,
  })
  verificationStatus!: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
    precision: 3,
  })
  createdAt!: Date;
}
