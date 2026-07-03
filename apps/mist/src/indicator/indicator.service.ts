import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { K, Security, Period, DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';
import { ADX, ATR, MACD, RSI, SMA, Stochastic } from 'technicalindicators';

// Internal interfaces for indicator calculations
interface RunKDJDto {
  high: number[];
  low: number[];
  close: number[];
  period?: number;
  kSmoothing?: number;
  dSmoothing?: number;
}

interface RunOhlcIndicatorDto {
  high: number[];
  low: number[];
  close: number[];
  period?: number;
}

interface RunDualMADto {
  close: number[];
  shortPeriod?: number;
  longPeriod?: number;
}

interface FindKDataQuery {
  code: string;
  period: Period;
  startDate: Date;
  endDate: Date;
  source?: DataSource;
}

type CompleteMacdValue = {
  MACD: number;
  signal: number;
  histogram: number;
};

@Injectable()
export class IndicatorService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(K)
    private kRepository: Repository<K>,
    private dataSourceService: DataSourceService,
  ) {}

  private begIndex(inputLength: number, outputLength: number): number {
    return outputLength > 0 ? inputLength - outputLength : inputLength;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private isCompleteMacdValue(value: {
    MACD?: number;
    signal?: number;
    histogram?: number;
  }): value is CompleteMacdValue {
    return (
      this.isFiniteNumber(value.MACD) &&
      this.isFiniteNumber(value.signal) &&
      this.isFiniteNumber(value.histogram)
    );
  }

  async runMACD(prices: number[]): Promise<{
    begIndex: number;
    nbElement: number;
    macd: number[];
    signal: number[];
    histogram: number[];
  }> {
    const numericPrices = prices.map(Number);
    const values = MACD.calculate({
      values: numericPrices,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }).filter((value): value is CompleteMacdValue =>
      this.isCompleteMacdValue(value),
    );
    const macd = values.map((value) => value.MACD);
    const signal = values.map((value) => value.signal);
    const histogram = values.map((value) => value.histogram);

    return {
      begIndex: this.begIndex(numericPrices.length, macd.length),
      nbElement: macd.length,
      macd,
      signal,
      histogram,
    };
  }

  async runRSI(
    prices: number[],
    period: number = 14,
  ): Promise<{
    begIndex: number;
    nbElement: number;
    rsi: number[];
  }> {
    const rsi = RSI.calculate({
      values: prices,
      period,
    });

    return {
      begIndex: this.begIndex(prices.length, rsi.length),
      nbElement: rsi.length,
      rsi,
    };
  }

  async runKDJ(data: RunKDJDto): Promise<{
    begIndex: number;
    nbElement: number;
    K: number[];
    D: number[];
    J: number[];
  }> {
    const raw = Stochastic.calculate({
      high: data.high,
      low: data.low,
      close: data.close,
      period: data.period || 9,
      signalPeriod: data.kSmoothing || 3,
    });
    const slowK = raw
      .filter((value) => this.isFiniteNumber(value.d))
      .map((value) => value.d);
    const D = SMA.calculate({
      values: slowK,
      period: data.dSmoothing || 3,
    });
    const K = slowK.slice(slowK.length - D.length);
    const J = K.map((kValue, index) => 3 * kValue - 2 * D[index]);

    return {
      K,
      D,
      J,
      begIndex: this.begIndex(data.close.length, K.length),
      nbElement: K.length,
    };
  }

  async runADX(data: RunOhlcIndicatorDto): Promise<number[]> {
    return ADX.calculate({
      high: data.high,
      low: data.low,
      close: data.close,
      period: data.period || 14,
    }).map((value) => value.adx);
  }

  async runDualMA(
    data: RunDualMADto,
  ): Promise<{ shortMA: number[]; longMA: number[] }> {
    return {
      shortMA: SMA.calculate({
        values: data.close,
        period: data.shortPeriod || 13,
      }),
      longMA: SMA.calculate({
        values: data.close,
        period: data.longPeriod || 60,
      }),
    };
  }

  async runATR(data: RunOhlcIndicatorDto): Promise<number[]> {
    return ATR.calculate({
      high: data.high,
      low: data.low,
      close: data.close,
      period: data.period || 14,
    });
  }

  /**
   * Find K-line data from database with optional data source selection.
   * This method provides read access to K-line data for indicators and Chan Theory.
   *
   * @param query - Query parameters including symbol, period, dates, and optional source
   * @returns Array of K entities
   */
  async findKData(query: FindKDataQuery): Promise<K[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: query.code,
    });
    if (!foundSecurity) {
      throw new HttpException(
        ERROR_MESSAGES.INDEX_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Resolve data source (use provided or fall back to default)
    const source = query.source
      ? this.dataSourceService.select(query.source)
      : this.dataSourceService.getDefault();

    const foundKs = await this.kRepository.find({
      relations: ['security'],
      where: {
        security: {
          id: foundSecurity.id,
          code: foundSecurity.code,
        },
        source,
        period: query.period,
        timestamp: Between(query.startDate, query.endDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });
    return foundKs;
  }
}
