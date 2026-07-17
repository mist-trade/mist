import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import {
  StrategyBacktestPageQueryDto,
  StrategyBacktestPositionQueryDto,
  StrategyBacktestRunListQueryDto,
  StrategyBacktestRunParamDto,
} from '../dto/query-strategy-backtest.dto';
import { StrategyBacktestService } from '../services/strategy-backtest.service';

@ApiTags('strategy backtests v1')
@Controller('v1/strategy-backtests')
export class StrategyBacktestController {
  constructor(
    private readonly strategyBacktestService: StrategyBacktestService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async createRun(@Body() dto: CreateBacktestRunDto) {
    return await this.strategyBacktestService.createRun(dto);
  }

  @Get()
  async listRuns(@Query() query: StrategyBacktestRunListQueryDto) {
    return await this.strategyBacktestService.listRuns(query);
  }

  @Post(':runId/cancel')
  async cancelRun(@Param() { runId }: StrategyBacktestRunParamDto) {
    return await this.strategyBacktestService.cancelRun(runId);
  }

  @Get(':runId/equity')
  async listEquity(@Param() { runId }: StrategyBacktestRunParamDto) {
    return await this.strategyBacktestService.listEquity(runId);
  }

  @Get(':runId/signals')
  async listSignals(
    @Param() { runId }: StrategyBacktestRunParamDto,
    @Query() query: StrategyBacktestPageQueryDto,
  ) {
    return await this.strategyBacktestService.listSignals(runId, query);
  }

  @Get(':runId/orders')
  async listOrders(
    @Param() { runId }: StrategyBacktestRunParamDto,
    @Query() query: StrategyBacktestPageQueryDto,
  ) {
    return await this.strategyBacktestService.listOrders(runId, query);
  }

  @Get(':runId/trades')
  async listTrades(
    @Param() { runId }: StrategyBacktestRunParamDto,
    @Query() query: StrategyBacktestPageQueryDto,
  ) {
    return await this.strategyBacktestService.listTrades(runId, query);
  }

  @Get(':runId/positions')
  async listPositions(
    @Param() { runId }: StrategyBacktestRunParamDto,
    @Query() query: StrategyBacktestPositionQueryDto,
  ) {
    const { asOf, ...pageQuery } = query;
    return await this.strategyBacktestService.listPositions(
      runId,
      asOf,
      pageQuery,
    );
  }

  @Get(':runId')
  async findRun(@Param() { runId }: StrategyBacktestRunParamDto) {
    return await this.strategyBacktestService.findRun(runId);
  }
}
