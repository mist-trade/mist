import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BacktestTradeResultVo {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  backtestRunId!: number;

  @ApiPropertyOptional({ nullable: true })
  securityId!: number | null;

  @ApiProperty()
  securityCode!: string;

  @ApiProperty()
  entryTime!: string;

  @ApiProperty()
  exitTime!: string;

  @ApiProperty()
  holdingBars!: number;

  @ApiProperty()
  entryPrice!: number;

  @ApiProperty()
  exitPrice!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  realizedPnl!: number;

  @ApiProperty()
  returnRatio!: number;

  @ApiProperty()
  exitReason!: string;

  @ApiProperty()
  createdAt!: string;
}
