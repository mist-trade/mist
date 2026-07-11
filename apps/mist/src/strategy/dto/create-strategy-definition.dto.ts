import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class CreateStrategyDefinitionDto {
  @ApiProperty({ description: 'Strategy display name' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Strategy description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Canonical security codes to evaluate' })
  @IsArray()
  @IsString({ each: true })
  targetUniverse!: string[];

  @ApiProperty({
    description: 'Supported periods',
    enum: Period,
    isArray: true,
  })
  @IsArray()
  @IsEnum(Period, { each: true })
  periods!: Period[];

  @ApiProperty({
    description: 'Supported data sources',
    enum: DataSource,
    isArray: true,
  })
  @IsArray()
  @IsEnum(DataSource, { each: true })
  sources!: DataSource[];

  @ApiProperty({ description: 'Declarative entry rule expression' })
  @IsObject()
  entryRule!: Record<string, unknown>;

  @ApiProperty({
    description: 'Declarative exit rule expression',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsObject()
  exitRule?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Completed daily bars retained for rule evaluation',
    minimum: 1,
    maximum: 250,
  })
  @IsInt()
  @Min(1)
  @Max(250)
  lookbackBars!: number;

  @ApiProperty({
    description: 'Whether this definition may create portfolio backtest runs',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  backtestEnabled?: boolean;
}
