import { Equals, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Period } from '@app/shared-data';

export class TdxStreamingTestSubscribeDto {
  @ApiProperty({ description: '证券代码', example: '600030' })
  @IsNotEmpty({ message: '证券代码不能为空' })
  code!: string;

  @ApiProperty({
    description: 'K线周期',
    enum: Period,
    example: Period.ONE_MIN,
  })
  @IsEnum(Period, {
    message: `周期必须是以下数值之一: ${Object.keys(Period)
      .filter((key) => isNaN(Number(key)))
      .join(', ')}`,
  })
  period!: Period;

  @ApiProperty({
    description: 'Must be true to acknowledge this is a test-only endpoint',
    example: true,
  })
  @Equals(true, {
    message: 'testOnly must be true for this test-only endpoint',
  })
  testOnly!: true;
}
