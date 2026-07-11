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
import { BacktestRunStatus } from '@app/shared-data';
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
  @HttpCode(HttpStatus.ACCEPTED)
  async createRun(@Body() dto: CreateBacktestRunDto) {
    return await this.strategyBacktestService.createRun(dto);
  }

  @Get()
  async listRuns(
    @Query('strategyDefinitionId') strategyDefinitionId?: string,
    @Query('status') status?: BacktestRunStatus,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.strategyBacktestService.listRuns({
      strategyDefinitionId:
        strategyDefinitionId === undefined
          ? undefined
          : Number(strategyDefinitionId),
      status,
      ...this.toPageQuery(cursor, limit),
    });
  }

  @Post(':runId/cancel')
  async cancelRun(@Param('runId') runId: string) {
    return await this.strategyBacktestService.cancelRun(Number(runId));
  }

  @Get(':runId/equity')
  async listEquity(@Param('runId') runId: string) {
    return await this.strategyBacktestService.listEquity(Number(runId));
  }

  @Get(':runId/signals')
  async listSignals(
    @Param('runId') runId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.strategyBacktestService.listSignals(
      Number(runId),
      this.toPageQuery(cursor, limit),
    );
  }

  @Get(':runId/orders')
  async listOrders(
    @Param('runId') runId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.strategyBacktestService.listOrders(
      Number(runId),
      this.toPageQuery(cursor, limit),
    );
  }

  @Get(':runId/trades')
  async listTrades(
    @Param('runId') runId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.strategyBacktestService.listTrades(
      Number(runId),
      this.toPageQuery(cursor, limit),
    );
  }

  @Get(':runId/positions')
  async listPositions(
    @Param('runId') runId: string,
    @Query('asOf') asOf?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.strategyBacktestService.listPositions(
      Number(runId),
      asOf === undefined ? undefined : new Date(asOf),
      this.toPageQuery(cursor, limit),
    );
  }

  @Get(':runId')
  async findRun(@Param('runId') runId: string) {
    return await this.strategyBacktestService.findRun(Number(runId));
  }

  private toPageQuery(cursor?: string, limit?: string) {
    return {
      cursor,
      limit: limit === undefined ? undefined : Number(limit),
    };
  }
}
