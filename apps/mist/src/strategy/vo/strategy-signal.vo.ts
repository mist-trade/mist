import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DataSource,
  Period,
  StrategySignalKind,
  StrategySignalSource,
} from '@app/shared-data';

export class StrategySignalSecurityVo {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class StrategySignalVo {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  strategyDefinitionId!: number;

  @ApiProperty()
  strategyVersionId!: number;

  @ApiProperty()
  securityId!: number;

  @ApiPropertyOptional({ type: StrategySignalSecurityVo })
  security?: StrategySignalSecurityVo;

  @ApiProperty({ enum: Period })
  period!: Period;

  @ApiProperty({ enum: DataSource })
  source!: DataSource;

  @ApiProperty({ type: String, format: 'date-time' })
  signalTime!: Date;

  @ApiProperty({ enum: StrategySignalSource })
  signalSource!: StrategySignalSource;

  @ApiProperty({ enum: StrategySignalKind })
  signalKind!: StrategySignalKind;

  @ApiPropertyOptional({ type: Number, nullable: true })
  confidence!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  confidenceLevel!: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  decisionTrace!: Record<string, unknown> | null;

  @ApiProperty({ type: Object })
  contextSnapshot!: Record<string, unknown>;

  @ApiProperty({ type: Object })
  ruleSnapshot!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
