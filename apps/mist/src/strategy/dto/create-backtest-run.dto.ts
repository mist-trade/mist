import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
} from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class CreateBacktestRunDto {
  @ApiProperty({ description: 'Strategy version to replay' })
  @IsInt()
  strategyVersionId!: number;

  @ApiProperty({ description: 'Canonical security codes to replay' })
  @IsArray()
  @IsString({ each: true })
  targetUniverse!: string[];

  @ApiProperty({ description: 'Replay period', enum: Period })
  @IsEnum(Period)
  period!: Period;

  @ApiProperty({ description: 'Replay data source', enum: DataSource })
  @IsEnum(DataSource)
  source!: DataSource;

  @ApiProperty({ description: 'Inclusive replay start date' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'Inclusive replay end date' })
  @IsDateString()
  endDate!: string;
}
