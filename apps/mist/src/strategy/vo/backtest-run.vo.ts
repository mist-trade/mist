import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BacktestRunStatus,
  DataSource,
  Period,
  type BacktestNavPoint,
} from '@app/shared-data';
import { BacktestTargetIssueVo } from './backtest-target-issue.vo';

export class BacktestRunVo {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  strategyDefinitionId!: number;
  @ApiProperty()
  strategyVersionId!: number;
  @ApiProperty({ type: [String] })
  targetUniverse!: string[];
  @ApiProperty({ enum: Period })
  period!: Period;
  @ApiProperty({ enum: DataSource })
  source!: DataSource;
  @ApiProperty()
  startDate!: string;
  @ApiProperty()
  endDate!: string;
  @ApiProperty({ enum: BacktestRunStatus })
  status!: BacktestRunStatus;
  @ApiProperty()
  signalCount!: number;
  @ApiProperty()
  matchedSecurityCount!: number;
  @ApiProperty({ type: [BacktestTargetIssueVo] })
  targetIssues!: BacktestTargetIssueVo[];
  @ApiPropertyOptional({ nullable: true })
  startedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  completedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  errorMessage!: string | null;
  @ApiPropertyOptional({ nullable: true })
  totalReturn?: number | null;
  @ApiPropertyOptional({ nullable: true })
  annualizedReturn?: number | null;
  @ApiPropertyOptional({ nullable: true })
  maxDrawdown?: number | null;
  @ApiPropertyOptional({ nullable: true })
  sharpeRatio?: number | null;
  @ApiPropertyOptional({ nullable: true })
  calmarRatio?: number | null;
  @ApiPropertyOptional({ nullable: true })
  winRate?: number | null;
  @ApiPropertyOptional({ nullable: true })
  profitLossRatio?: number | null;
  @ApiPropertyOptional({ nullable: true })
  tradeCount?: number | null;
  @ApiPropertyOptional({ nullable: true })
  navSeries?: BacktestNavPoint[] | null;
  @ApiPropertyOptional({ nullable: true })
  benchmarkCode?: string | null;
  @ApiPropertyOptional({ nullable: true })
  parentRunId?: number | null;
  @ApiPropertyOptional({ nullable: true })
  suiteId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  stage?: string | null;
  @ApiPropertyOptional({ nullable: true })
  scenarioId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  contextSnapshot?: Record<string, unknown> | null;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty()
  updatedAt!: string;
}
