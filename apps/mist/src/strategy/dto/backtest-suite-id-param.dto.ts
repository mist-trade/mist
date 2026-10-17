import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class BacktestSuiteIdParamDto {
  @ApiProperty({ description: '回测套件批次唯一标识' })
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  suiteId!: string;
}
