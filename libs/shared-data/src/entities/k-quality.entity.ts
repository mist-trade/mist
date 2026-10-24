import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { K } from './k.entity';

/**
 * Per-bar numeric quality contract.
 *
 * Every field carries a 0/1 usability flag so callers can compute with it
 * directly, e.g. `volume * volume_valid * volume_scale`. `caliber_epoch`
 * identifies the provider's aggregation-basis segment: values are comparable
 * inside one epoch and not across epochs. A bar flagged invalid is still a
 * stored market fact; filtering is the consumer's decision.
 */
@Entity({ name: 'k_quality' })
export class KQuality {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @OneToOne(() => K, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'k_id' })
  k!: K;

  @Column({ name: 'k_id', select: false })
  kId!: number;

  @Column({ name: 'open_valid', type: 'tinyint', width: 1, default: 1 })
  openValid: number = 1;

  @Column({ name: 'high_valid', type: 'tinyint', width: 1, default: 1 })
  highValid: number = 1;

  @Column({ name: 'low_valid', type: 'tinyint', width: 1, default: 1 })
  lowValid: number = 1;

  @Column({ name: 'close_valid', type: 'tinyint', width: 1, default: 1 })
  closeValid: number = 1;

  @Column({ name: 'volume_valid', type: 'tinyint', width: 1, default: 1 })
  volumeValid: number = 1;

  @Column({ name: 'amount_valid', type: 'tinyint', width: 1, default: 1 })
  amountValid: number = 1;

  @Column({
    name: 'volume_scale',
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 1,
    comment: '量纲归一因子：volume*scale=可比口径',
  })
  volumeScale: string = '1';

  @Column({
    name: 'amount_scale',
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: 1,
    comment: '量纲归一因子：amount*scale=可比口径',
  })
  amountScale: string = '1';

  @Column({
    name: 'caliber_epoch',
    type: 'smallint',
    unsigned: true,
    default: 1,
    comment: '口径分段号：同 epoch 内可比，跨 epoch 不可比',
  })
  caliberEpoch: number = 1;

  @Column({ name: 'manual_fix', type: 'tinyint', width: 1, default: 0 })
  manualFix: number = 0;

  @Column({
    name: 'derived_from_period',
    type: 'int',
    nullable: true,
    comment: 'NULL=原生；5=由5分钟聚合',
  })
  derivedFromPeriod: number | null = null;

  @Column({
    name: 'dataset_version',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '导入批次标识',
  })
  datasetVersion: string | null = null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
