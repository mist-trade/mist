import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'market_macro_indicators' })
@Index('uk_trading_date', ['tradingDate'], { unique: true })
@Index('idx_trading_date_erp', ['tradingDate', 'erpRatio'])
export class MarketMacroIndicator {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id!: number;

  @Column({ name: 'trading_date', type: 'date' })
  tradingDate!: string;

  @Column({
    name: 'breadth_cys13_oversold_ratio',
    type: 'decimal',
    precision: 6,
    scale: 4,
  })
  breadthCys13OversoldRatio!: number;

  @Column({
    name: 'breadth_above_ma250_ratio',
    type: 'decimal',
    precision: 6,
    scale: 4,
  })
  breadthAboveMa250Ratio!: number;

  @Column({
    name: 'all_a_turnover_rate',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  allATurnoverRate?: number | null;

  @Column({
    name: 'all_a_turnover_percentile_10y',
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
  })
  allATurnoverPercentile10y?: number | null;

  @Column({
    name: 'china_10y_bond_yield',
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
  })
  china10yBondYield?: number | null;

  @Column({
    name: 'index_pe_ttm',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  indexPeTtm?: number | null;

  @Column({
    name: 'erp_ratio',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  erpRatio?: number | null;

  @Column({
    name: 'erp_percentile_10y',
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
  })
  erpPercentile10y?: number | null;

  @Column({
    name: 'erp_zscore_10y',
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
  })
  erpZScore10y?: number | null;

  @Column({
    name: 'sample_count',
    type: 'int',
    unsigned: true,
    default: 0,
  })
  sampleCount: number = 0;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
