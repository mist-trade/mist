import { ApiProperty } from '@nestjs/swagger';

export class BacktestSuiteReceiptVo {
  @ApiProperty({ description: '回测套件批次唯一标识' })
  suiteId!: string;

  @ApiProperty({ description: '主回测运行 ID', minimum: 1 })
  masterRunId!: number;

  @ApiProperty({ enum: ['PENDING'] })
  initialStatus = 'PENDING' as const;
}
