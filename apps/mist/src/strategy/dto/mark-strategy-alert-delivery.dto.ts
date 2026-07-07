import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class MarkStrategyAlertDeliveryDto {
  @ApiPropertyOptional({ description: 'Delivery or failure metadata' })
  @IsOptional()
  @IsObject()
  deliveryResult?: Record<string, unknown>;
}
