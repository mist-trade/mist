import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { QueryStrategySignalDto } from '../dto/query-strategy-signal.dto';
import { StrategySignalService } from '../services/strategy-signal.service';
import { StrategySignalVo } from '../vo/strategy-signal.vo';

@ApiTags('strategy signals v1')
@Controller('v1/strategy-signals')
export class StrategySignalController {
  constructor(private readonly strategySignalService: StrategySignalService) {}

  @Get()
  @ApiEnvelopeResponse({
    status: 200,
    type: StrategySignalVo,
    isArray: true,
  })
  async findAll(@Query() query: QueryStrategySignalDto) {
    return await this.strategySignalService.findAll(query);
  }
}
