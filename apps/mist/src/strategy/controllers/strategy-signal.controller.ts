import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { QueryStrategySignalDto } from '../dto/query-strategy-signal.dto';
import { StrategySignalService } from '../services/strategy-signal.service';

@ApiTags('strategy signals v1')
@Controller('v1/strategy-signals')
export class StrategySignalController {
  constructor(private readonly strategySignalService: StrategySignalService) {}

  @Get()
  async findAll(@Query() query: QueryStrategySignalDto) {
    return await this.strategySignalService.findAll(query);
  }
}
