import { ApiProperty } from '@nestjs/swagger';
import { BacktestTradeResultVo } from './backtest-trade-result.vo';

export class BacktestTradeResultPageVo {
  @ApiProperty({ type: [BacktestTradeResultVo] })
  items!: BacktestTradeResultVo[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
