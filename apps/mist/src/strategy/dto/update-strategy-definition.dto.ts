import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { DataSource, Period } from '@app/shared-data';

export class UpdateStrategyDefinitionDto {
  @ApiProperty({ description: 'Strategy display name', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Strategy description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Canonical security codes to evaluate',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetUniverse?: string[];

  @ApiProperty({
    description: 'Supported periods',
    enum: Period,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Period, { each: true })
  periods?: Period[];

  @ApiProperty({
    description: 'Supported data sources',
    enum: DataSource,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(DataSource, { each: true })
  sources?: DataSource[];

  @ApiProperty({ description: 'Declarative rule expression', required: false })
  @IsOptional()
  @IsObject()
  rule?: Record<string, unknown>;
}
