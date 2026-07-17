import { BacktestRunStatus } from '@app/shared-data';
import { BEIJING_DATE_REGEX } from '@app/timezone';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class StrategyBacktestRunParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  runId!: number;
}

export class StrategyBacktestPageQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class StrategyBacktestRunListQueryDto extends StrategyBacktestPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  strategyDefinitionId?: number;

  @IsOptional()
  @IsEnum(BacktestRunStatus)
  status?: BacktestRunStatus;
}

export class StrategyBacktestPositionQueryDto extends StrategyBacktestPageQueryDto {
  @IsOptional()
  @Matches(BEIJING_DATE_REGEX)
  @IsDateString({ strict: true, strictSeparator: true })
  asOf?: string;
}
