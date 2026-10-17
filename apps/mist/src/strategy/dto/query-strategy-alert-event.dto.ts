import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { StrategyAlertStatus } from '@app/shared-data';
import {
  DEFAULT_API_PAGE_LIMIT,
  MAX_API_PAGE_LIMIT,
  MIN_API_PAGE_LIMIT,
} from '@app/constants';

export class QueryStrategyAlertEventDto {
  @IsOptional()
  @IsEnum(StrategyAlertStatus)
  status?: StrategyAlertStatus;

  @IsOptional()
  @IsString()
  strategySignalId?: string;

  @ApiPropertyOptional({
    description: `Maximum number of events to return (${MIN_API_PAGE_LIMIT}-${MAX_API_PAGE_LIMIT})`,
    default: DEFAULT_API_PAGE_LIMIT,
    maximum: MAX_API_PAGE_LIMIT,
    type: Number,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(MIN_API_PAGE_LIMIT)
  @Max(MAX_API_PAGE_LIMIT)
  limit = DEFAULT_API_PAGE_LIMIT;
}
