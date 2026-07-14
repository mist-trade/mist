import { ApiProperty } from '@nestjs/swagger';

export class KVo {
  @ApiProperty()
  id!: number;
  @ApiProperty()
  symbol!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  time!: Date;
  @ApiProperty()
  amount!: number;
  @ApiProperty()
  open!: number;
  @ApiProperty()
  close!: number;
  @ApiProperty()
  highest!: number;
  @ApiProperty()
  lowest!: number;
}
