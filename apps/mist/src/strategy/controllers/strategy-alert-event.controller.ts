import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { MarkStrategyAlertDeliveryDto } from '../dto/mark-strategy-alert-delivery.dto';
import { QueryStrategyAlertEventDto } from '../dto/query-strategy-alert-event.dto';
import { StrategyAlertEventService } from '../services/strategy-alert-event.service';
import { StrategyAlertEventVo } from '../vo/strategy-alert-event.vo';

@ApiTags('strategy alert events v1')
@Controller('v1/strategy-alert-events')
export class StrategyAlertEventController {
  constructor(
    private readonly strategyAlertEventService: StrategyAlertEventService,
  ) {}

  @Get()
  @ApiEnvelopeResponse({
    status: 200,
    type: StrategyAlertEventVo,
    isArray: true,
  })
  async findAll(
    @Query() query: QueryStrategyAlertEventDto,
  ): Promise<StrategyAlertEventVo[]> {
    return await this.strategyAlertEventService.findAll(query);
  }

  @Post(':id/delivered')
  @ApiEnvelopeResponse({ status: 200, type: StrategyAlertEventVo })
  async markDelivered(
    @Param('id') id: string,
    @Body() dto: MarkStrategyAlertDeliveryDto,
  ): Promise<StrategyAlertEventVo> {
    return await this.strategyAlertEventService.markDelivered(Number(id), dto);
  }

  @Post(':id/failed')
  @ApiEnvelopeResponse({ status: 200, type: StrategyAlertEventVo })
  async markFailed(
    @Param('id') id: string,
    @Body() dto: MarkStrategyAlertDeliveryDto,
  ): Promise<StrategyAlertEventVo> {
    return await this.strategyAlertEventService.markFailed(Number(id), dto);
  }

  @Post(':id/ack')
  @ApiEnvelopeResponse({ status: 200, type: StrategyAlertEventVo })
  async acknowledge(@Param('id') id: string): Promise<StrategyAlertEventVo> {
    return await this.strategyAlertEventService.acknowledge(Number(id));
  }
}
