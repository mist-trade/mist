import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StrategyAlertStatus } from '@app/shared-data';

export class QueryStrategyAlertEventDto {
  @IsOptional()
  @IsEnum(StrategyAlertStatus)
  status?: StrategyAlertStatus;

  @IsOptional()
  @IsString()
  strategySignalId?: string;
}
