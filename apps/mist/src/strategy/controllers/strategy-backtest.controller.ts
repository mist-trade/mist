import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import { StrategyBacktestService } from '../services/strategy-backtest.service';

@ApiTags('strategy backtests v1')
@Controller('v1/strategy-backtests')
export class StrategyBacktestController {
  constructor(
    private readonly strategyBacktestService: StrategyBacktestService,
  ) {}

  @Post()
  async createRun(@Body() dto: CreateBacktestRunDto) {
    return await this.strategyBacktestService.createRun(dto);
  }

  @Get(':runId')
  async findRun(@Param('runId') runId: string) {
    return await this.strategyBacktestService.findRun(Number(runId));
  }

  @Get(':runId/signals')
  async listSignals(@Param('runId') runId: string) {
    return await this.strategyBacktestService.listSignals(Number(runId));
  }
}
