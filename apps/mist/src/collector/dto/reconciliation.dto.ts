import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PushBarItemDto {
  @IsNumber()
  timestamp!: number;

  @IsNumber()
  open!: number;

  @IsNumber()
  high!: number;

  @IsNumber()
  low!: number;

  @IsNumber()
  close!: number;

  @IsNumber()
  volume!: number;

  @IsOptional()
  @IsNumber()
  amount?: number;
}

export class PushBarsDto {
  @IsString()
  @IsIn(['tdx', 'qmt'])
  source!: 'tdx' | 'qmt';

  @IsString()
  symbol!: string;

  @IsString()
  period!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushBarItemDto)
  bars!: PushBarItemDto[];
}
