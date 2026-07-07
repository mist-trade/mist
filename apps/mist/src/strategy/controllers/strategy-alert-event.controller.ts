import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MarkStrategyAlertDeliveryDto } from '../dto/mark-strategy-alert-delivery.dto';
import { QueryStrategyAlertEventDto } from '../dto/query-strategy-alert-event.dto';
import { StrategyAlertEventService } from '../services/strategy-alert-event.service';

@ApiTags('strategy alert events v1')
@Controller('v1/strategy-alert-events')
export class StrategyAlertEventController {
  constructor(
    private readonly strategyAlertEventService: StrategyAlertEventService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryStrategyAlertEventDto) {
    return await this.strategyAlertEventService.findAll(query);
  }

  @Post(':id/delivered')
  async markDelivered(
    @Param('id') id: string,
    @Body() dto: MarkStrategyAlertDeliveryDto,
  ) {
    return await this.strategyAlertEventService.markDelivered(Number(id), dto);
  }

  @Post(':id/failed')
  async markFailed(
    @Param('id') id: string,
    @Body() dto: MarkStrategyAlertDeliveryDto,
  ) {
    return await this.strategyAlertEventService.markFailed(Number(id), dto);
  }

  @Post(':id/ack')
  async acknowledge(@Param('id') id: string) {
    return await this.strategyAlertEventService.acknowledge(Number(id));
  }
}
