import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class RunStrategyScanDto {
  @IsOptional()
  @IsInt()
  strategyDefinitionId?: number;

  @IsOptional()
  @IsEnum(Period)
  period?: Period;

  @IsOptional()
  @IsEnum(DataSource)
  source?: DataSource;
}
