import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketMacroIndicator } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import {
  computeCysMarketBreadth,
  computeBinaryMarketBreadth,
  DEFAULT_CYS_OVERSOLD_THRESHOLD,
} from '@app/indicators';
import { toErrorMessage } from '@app/utils';

export interface StockQuoteSnapshot {
  readonly code: string;
  readonly close: number;
  readonly cys13?: number | null;
  readonly aboveMa250?: boolean | null;
}

export interface MarketBreadthAggregatedResult {
  readonly tradingDate: string;
  readonly breadthCys13OversoldRatio: number;
  readonly breadthAboveMa250Ratio: number;
  readonly sampleCount: number;
}

@Injectable()
export class MarketBreadthCollectionService {
  private readonly logger = new Logger(MarketBreadthCollectionService.name);

  constructor(
    @InjectRepository(MarketMacroIndicator)
    private readonly macroIndicatorRepo: Repository<MarketMacroIndicator>,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * Aggregates cross-sectional breadth metrics from pre-calculated or fetched stock quotes.
   */
  aggregateBreadth(
    tradingDate: string,
    quotes: readonly StockQuoteSnapshot[],
    cysThreshold: number = DEFAULT_CYS_OVERSOLD_THRESHOLD,
  ): MarketBreadthAggregatedResult {
    const cysValues = quotes.map((q) => q.cys13);
    const ma250Flags = quotes.map((q) => q.aboveMa250);

    const cysBreadth = computeCysMarketBreadth(cysValues, cysThreshold);
    const ma250Breadth = computeBinaryMarketBreadth(ma250Flags);

    return {
      tradingDate,
      breadthCys13OversoldRatio: cysBreadth.ratio,
      breadthAboveMa250Ratio: ma250Breadth.ratio,
      sampleCount: Math.max(cysBreadth.validCount, ma250Breadth.validCount),
    };
  }

  /**
   * Persists the aggregated macro indicator into MySQL atomically.
   */
  async saveMacroIndicator(
    data: Partial<MarketMacroIndicator> & {
      tradingDate: string;
      breadthCys13OversoldRatio: number;
      breadthAboveMa250Ratio: number;
    },
  ): Promise<MarketMacroIndicator> {
    const existing = await this.macroIndicatorRepo.findOne({
      where: { tradingDate: data.tradingDate },
    });

    const target = existing ?? this.macroIndicatorRepo.create();
    target.tradingDate = data.tradingDate;
    target.breadthCys13OversoldRatio = data.breadthCys13OversoldRatio;
    target.breadthAboveMa250Ratio = data.breadthAboveMa250Ratio;

    if (data.allATurnoverRate !== undefined) {
      target.allATurnoverRate = data.allATurnoverRate;
    }
    if (data.allATurnoverPercentile10y !== undefined) {
      target.allATurnoverPercentile10y = data.allATurnoverPercentile10y;
    }
    if (data.china10yBondYield !== undefined) {
      target.china10yBondYield = data.china10yBondYield;
    }
    if (data.indexPeTtm !== undefined) {
      target.indexPeTtm = data.indexPeTtm;
    }
    if (data.erpRatio !== undefined) {
      target.erpRatio = data.erpRatio;
    }
    if (data.erpPercentile10y !== undefined) {
      target.erpPercentile10y = data.erpPercentile10y;
    }
    if (data.erpZScore10y !== undefined) {
      target.erpZScore10y = data.erpZScore10y;
    }
    if (data.sampleCount !== undefined) {
      target.sampleCount = data.sampleCount;
    }

    const saved = await this.macroIndicatorRepo.save(target);
    this.logger.log(
      `[MarketBreadth] event=macro_indicators_saved date=${saved.tradingDate} ` +
        `cys13Oversold=${saved.breadthCys13OversoldRatio} aboveMa250=${saved.breadthAboveMa250Ratio} ` +
        `samples=${saved.sampleCount}`,
    );
    return saved;
  }

  /**
   * Nightly scheduled collection execution handler.
   */
  async runNightlyAggregation(
    quotes: readonly StockQuoteSnapshot[],
  ): Promise<MarketMacroIndicator | null> {
    const now = this.timezoneService.getCurrentBeijingTime();
    if (!(await this.timezoneService.isTradingDay(now))) {
      this.logger.debug(
        '[MarketBreadth] Skipping nightly aggregation: not an A-share trading day',
      );
      return null;
    }

    const tradingDate = now.toISOString().slice(0, 10);
    try {
      const aggregated = this.aggregateBreadth(tradingDate, quotes);
      return await this.saveMacroIndicator({
        ...aggregated,
      });
    } catch (error) {
      const message = toErrorMessage(error);
      this.logger.error(
        `[MarketBreadth] event=nightly_aggregation_failed date=${tradingDate} error="${message}"`,
      );
      throw error;
    }
  }
}
