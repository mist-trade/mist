import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DataSource, Period } from '@app/shared-data';

export class QueryStrategySignalDto {
  @IsOptional()
  @IsString()
  strategyDefinitionId?: string;

  @IsOptional()
  @IsString()
  securityId?: string;

  @IsOptional()
  @IsEnum(Period)
  period?: Period;

  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
