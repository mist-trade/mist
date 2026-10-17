import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class WfaOptionsDto {
  @ApiPropertyOptional({ enum: ['rolling', 'anchored'], default: 'rolling' })
  @IsOptional()
  @IsIn(['rolling', 'anchored'])
  windowType?: 'rolling' | 'anchored';

  @ApiPropertyOptional({
    description: '训练集（样本内）时长（月数）',
    default: 12,
  })
  @IsOptional()
  @IsInt()
  trainDurationMonths?: number;

  @ApiPropertyOptional({
    description: '测试集（样本外）时长（月数）',
    default: 3,
  })
  @IsOptional()
  @IsInt()
  testDurationMonths?: number;

  @ApiPropertyOptional({ description: '滚动步进时长（月数）', default: 3 })
  @IsOptional()
  @IsInt()
  stepDurationMonths?: number;
}

export class StressOptionsDto {
  @ApiPropertyOptional({
    description: '指定运行的历史压力场景 ID 列表',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scenarios?: string[];
}

export class CreateBacktestSuiteDto {
  @ApiProperty({ description: '套件类型', enum: ['WFA', 'STRESS_SUITE'] })
  @IsIn(['WFA', 'STRESS_SUITE'])
  type!: 'WFA' | 'STRESS_SUITE';

  @ApiPropertyOptional({ description: 'Strategy definition ID' })
  @IsOptional()
  @IsInt()
  strategyDefinitionId?: number;

  @ApiProperty({ description: 'Strategy version ID' })
  @IsInt()
  strategyVersionId!: number;

  @ApiProperty({ description: 'Canonical security codes to replay' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9._-]{1,20}$/, { each: true })
  targetUniverse!: string[];

  @ApiProperty({ description: 'Replay period', enum: Period })
  @IsEnum(Period)
  period!: Period;

  @ApiProperty({
    description: 'Replay data source',
    enum: [DataSource.TDX, DataSource.QMT],
  })
  @IsIn([DataSource.TDX, DataSource.QMT])
  source!: DataSource.TDX | DataSource.QMT;

  @ApiPropertyOptional({ description: 'Inclusive replay start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Inclusive replay end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'WFA 滚动前向切分参数' })
  @IsOptional()
  wfaOptions?: WfaOptionsDto;

  @ApiPropertyOptional({ description: '极端压力测试套件参数' })
  @IsOptional()
  stressOptions?: StressOptionsDto;
}
