import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;
const MIN_PAGE_LIMIT = 1;
const DEFAULT_PAGE_OFFSET = 0;

export class BacktestTradeResultQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(MIN_PAGE_LIMIT)
  @Max(MAX_PAGE_LIMIT)
  limit = DEFAULT_PAGE_LIMIT;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(DEFAULT_PAGE_OFFSET)
  offset = DEFAULT_PAGE_OFFSET;

  @IsOptional()
  @IsString()
  securityCode?: string;
}
