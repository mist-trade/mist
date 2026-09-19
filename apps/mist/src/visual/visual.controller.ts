import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '@app/transport/http';
import { TimezoneService } from '@app/timezone';
import { VisualCommandService } from '@app/visual-command';
import { prepareMarketData } from '@app/market-data';
import { type ChanBi, ChanCore, type ChanK } from '@app/chancore';
import { IndicatorService } from '../indicator/indicator.service';
import { QueryVisualCommandsDto } from './dto/query-visual-commands.dto';
import { VisualCommandPayloadVo } from './vo/visual-command.vo';

@ApiTags('visual')
@Controller('v1/visual')
export class VisualController {
  private readonly logger = new Logger(VisualController.name);

  constructor(
    private readonly visualCommandService: VisualCommandService,
    private readonly indicatorService: IndicatorService,
    private readonly timezoneService: TimezoneService,
  ) {}

  private toChanKlines(
    kEntities: any[],
    period: number,
    startDate: Date,
    endDate: Date,
    code: string,
    source?: string,
  ): ChanK[] {
    const sortedEntities = [...kEntities]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .filter(
        (item, idx, arr) =>
          idx === 0 ||
          item.timestamp.getTime() !== arr[idx - 1].timestamp.getTime(),
      );
    const pipeline = prepareMarketData({
      rawBars: sortedEntities,
      period,
      requiredBars: sortedEntities.length || 1,
      windowStartAt: startDate,
      windowEndAt: endDate,
    });

    if (pipeline.droppedKlines > 0) {
      this.logger.warn(
        `visual pipeline dropped ${pipeline.droppedKlines}/${pipeline.requestedKlines} bars code=${code} period=${period} source=${source ?? 'default'} resolutions=${JSON.stringify(pipeline.diagnostics.resolutionCounts)}`,
      );
    }

    return pipeline.projected
      .filter((bar) => bar.ohlc.effective !== null)
      .map((bar, idx) => ({
        id: idx + 1,
        symbol: code,
        time: bar.rawBar.timestamp,
        open: bar.ohlc.effective!.open,
        high: bar.ohlc.effective!.high,
        low: bar.ohlc.effective!.low,
        close: bar.ohlc.effective!.close,
        volume: bar.volume.effective,
        amount: bar.amount.effective,
      }));
  }

  @Get('commands')
  @ApiOperation({
    summary: '获取统一绘图指令流',
    description:
      '供 QMT / TDX 终端极简执行器调用的通用绘图指令接口，按请求图层批量返回折线、区间带与买卖点标记。以时间窗口为唯一真源，不做 count 尾部裁剪。',
  })
  @ApiEnvelopeResponse({
    status: 200,
    description: '成功返回通用绘图指令集合',
    type: VisualCommandPayloadVo,
  })
  async getCommands(@Query() query: QueryVisualCommandsDto) {
    const now = new Date();
    const endDate = query.endDate
      ? this.timezoneService.parseDateString(query.endDate)
      : now;

    // Default to a 60-day window if no startDate is provided
    const startDate = query.startDate
      ? this.timezoneService.parseDateString(query.startDate)
      : new Date(endDate.getTime() - 60 * 24 * 3600 * 1000);

    const kEntities = await this.indicatorService.findKData({
      code: query.code,
      period: query.period,
      startDate,
      endDate,
      source: query.source,
    });

    const chanKlines = this.toChanKlines(
      kEntities,
      query.period,
      startDate,
      endDate,
      query.code,
      query.source,
    );

    const requestedLayers = query.layers
      ? query.layers.split(',').map((s) => s.trim())
      : ['chan'];

    let macroBis: readonly ChanBi[] | undefined = undefined;

    if (query.macroPeriod) {
      const macroEntities = await this.indicatorService.findKData({
        code: query.code,
        period: query.macroPeriod,
        startDate,
        endDate,
        source: query.source,
      });

      const macroChanKlines = this.toChanKlines(
        macroEntities,
        query.macroPeriod,
        startDate,
        endDate,
        query.code,
        query.source,
      );

      if (macroChanKlines.length >= 3) {
        macroBis = ChanCore.createBi(macroChanKlines).phaseB;
      }
    }

    return this.visualCommandService.generateCommands({
      code: query.code,
      period: query.period,
      source: query.source ?? 'default',
      klines: chanKlines,
      layers: requestedLayers,
      chanOptions: macroBis && macroBis.length > 0 ? { macroBis } : undefined,
    });
  }
}
