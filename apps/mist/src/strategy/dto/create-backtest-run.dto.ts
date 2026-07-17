import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  ArrayMinSize,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Period } from '@app/shared-data';
import { BEIJING_DATE_REGEX } from '@app/timezone';
import {
  MAX_BACKTEST_CNY,
  STRATEGY_BACKTEST_SOURCES,
  type StrategyBacktestSource,
} from '../backtest/strategy-backtest.constants';

export class CreateBacktestRunDto {
  @ApiProperty({ description: 'Strategy definition to replay' })
  @IsInt()
  strategyDefinitionId!: number;

  @ApiProperty({
    description:
      'Optional immutable strategy version; defaults to the current version',
    required: false,
  })
  @IsOptional()
  @IsInt()
  strategyVersionId?: number;

  @ApiProperty({ description: 'Canonical security codes to replay' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^\d{6}$/, { each: true })
  targetUniverse!: string[];

  @ApiProperty({ description: 'Replay period', enum: Period })
  @IsEnum(Period)
  period!: Period;

  @ApiProperty({
    description: 'Replay data source',
    enum: STRATEGY_BACKTEST_SOURCES,
  })
  @IsIn(STRATEGY_BACKTEST_SOURCES)
  source!: StrategyBacktestSource;

  @ApiProperty({
    description: 'Inclusive replay start date (Beijing calendar, YYYY-MM-DD)',
  })
  @Matches(BEIJING_DATE_REGEX)
  startDate!: string;

  @ApiProperty({
    description: 'Inclusive replay end date (Beijing calendar, YYYY-MM-DD)',
  })
  @Matches(BEIJING_DATE_REGEX)
  endDate!: string;

  @ApiProperty({
    description: 'Initial CNY cash',
    required: false,
    default: 1_000_000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(MAX_BACKTEST_CNY)
  initialCash?: number;

  @ApiProperty({
    description: 'Maximum simultaneous long positions',
    required: false,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxPositions?: number;

  @ApiProperty({
    description: 'Directional execution slippage in basis points',
    required: false,
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10_000)
  slippageBps?: number;

  @ApiProperty({
    description: 'Both-side commission rate',
    required: false,
    default: 0.0003,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @ApiProperty({
    description: 'Minimum CNY commission per filled order',
    required: false,
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_BACKTEST_CNY)
  minCommission?: number;

  @ApiProperty({
    description: 'Sell-side stamp duty rate',
    required: false,
    default: 0.0005,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  stampDutyRate?: number;

  @ApiProperty({
    description: 'Both-side transfer fee rate',
    required: false,
    default: 0.00001,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  transferFeeRate?: number;

  @ApiProperty({
    description: 'Canonical benchmark index code',
    required: false,
    default: '000300',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  benchmarkCode?: string;
}
