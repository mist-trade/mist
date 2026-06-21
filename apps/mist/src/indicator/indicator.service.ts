import { ERROR_MESSAGES } from '@app/constants';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { K, Security, Period, DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';

// Internal interfaces for indicator calculations
interface RunKDJDto {
  high: number[];
  low: number[];
  close: number[];
  period?: number;
  kSmoothing?: number;
  dSmoothing?: number;
}

interface RunADXDto {
  high: number[];
  low: number[];
  close: number[];
  period?: number;
}

interface RunATRDto {
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

@Injectable()
export class IndicatorService implements OnModuleInit {
  private talib: any = null;

  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(K)
    private kRepository: Repository<K>,
    private dataSourceService: DataSourceService,
  ) {}

  onModuleInit() {
    this.talib = this.initTalib();
  }

  // 初始化函数
  private initTalib() {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('talib');
    } catch {
      return this.createFallbackTalib();
    }
  }

  private createFallbackTalib() {
    return {
      execute: (options: any) => {
        switch (options.name) {
          case 'MACD':
            return this.fallbackMACD(
              options.inReal,
              options.optInFastPeriod ?? 12,
              options.optInSlowPeriod ?? 26,
              options.optInSignalPeriod ?? 9,
            );
          case 'RSI':
            return this.fallbackRSI(
              options.inReal,
              options.optInTimePeriod ?? 14,
            );
          case 'STOCH':
            return this.fallbackSTOCH(
              options.high,
              options.low,
              options.close,
              options.optInFastK_Period ?? 9,
              options.optInSlowK_Period ?? 3,
              options.optInSlowD_Period ?? 3,
            );
          case 'ADX':
            return this.fallbackADX(
              options.high,
              options.low,
              options.close,
              options.optInTimePeriod ?? 14,
            );
          case 'SMA':
            return this.fallbackSMA(options.inReal, options.optInTimePeriod);
          case 'ATR':
            return this.fallbackATR(
              options.high,
              options.low,
              options.close,
              options.optInTimePeriod ?? 14,
            );
          default:
            throw new Error(`Unsupported fallback indicator: ${options.name}`);
        }
      },
    };
  }

  private fallbackMACD(
    values: number[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number,
  ) {
    const fast = this.emaSeries(values, fastPeriod);
    const slow = this.emaSeries(values, slowPeriod);
    const macdLine = values
      .map((_, index) =>
        Number.isFinite(fast[index]) && Number.isFinite(slow[index])
          ? fast[index] - slow[index]
          : Number.NaN,
      )
      .filter(Number.isFinite);
    const signal = this.emaSeries(macdLine, signalPeriod).filter(
      Number.isFinite,
    );
    const macd = macdLine.slice(macdLine.length - signal.length);
    const histogram = macd.map((value, index) => value - signal[index]);

    return {
      begIndex: values.length - macd.length,
      nbElement: macd.length,
      result: {
        outMACD: macd,
        outMACDSignal: signal,
        outMACDHist: histogram,
      },
    };
  }

  private fallbackRSI(values: number[], period: number) {
    if (values.length <= period) {
      return { begIndex: values.length, nbElement: 0, result: { outReal: [] } };
    }

    let gain = 0;
    let loss = 0;
    for (let index = 1; index <= period; index++) {
      const change = values[index] - values[index - 1];
      if (change >= 0) gain += change;
      else loss -= change;
    }

    let averageGain = gain / period;
    let averageLoss = loss / period;
    const rsi = [this.rsiValue(averageGain, averageLoss)];

    for (let index = period + 1; index < values.length; index++) {
      const change = values[index] - values[index - 1];
      const currentGain = Math.max(change, 0);
      const currentLoss = Math.max(-change, 0);
      averageGain = (averageGain * (period - 1) + currentGain) / period;
      averageLoss = (averageLoss * (period - 1) + currentLoss) / period;
      rsi.push(this.rsiValue(averageGain, averageLoss));
    }

    return {
      begIndex: period,
      nbElement: rsi.length,
      result: { outReal: rsi },
    };
  }

  private fallbackSTOCH(
    high: number[],
    low: number[],
    close: number[],
    period: number,
    kSmoothing: number,
    dSmoothing: number,
  ) {
    const fastK: number[] = [];
    for (let index = period - 1; index < close.length; index++) {
      const windowHigh = Math.max(...high.slice(index - period + 1, index + 1));
      const windowLow = Math.min(...low.slice(index - period + 1, index + 1));
      fastK.push(
        windowHigh === windowLow
          ? 0
          : ((close[index] - windowLow) / (windowHigh - windowLow)) * 100,
      );
    }

    const slowK = this.smaValues(fastK, kSmoothing);
    const slowD = this.smaValues(slowK, dSmoothing);
    const alignedK = slowK.slice(slowK.length - slowD.length);

    return {
      begIndex: period + kSmoothing + dSmoothing - 3,
      nbElement: alignedK.length,
      result: {
        outSlowK: alignedK,
        outSlowD: slowD,
      },
    };
  }

  private fallbackADX(
    high: number[],
    low: number[],
    close: number[],
    period: number,
  ) {
    if (close.length <= period * 2) {
      return { begIndex: close.length, nbElement: 0, result: { outReal: [] } };
    }

    const plusDM: number[] = [];
    const minusDM: number[] = [];
    const trueRange: number[] = [];

    for (let index = 1; index < close.length; index++) {
      const upMove = high[index] - high[index - 1];
      const downMove = low[index - 1] - low[index];
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      trueRange.push(
        Math.max(
          high[index] - low[index],
          Math.abs(high[index] - close[index - 1]),
          Math.abs(low[index] - close[index - 1]),
        ),
      );
    }

    const dx: number[] = [];
    for (let index = period - 1; index < trueRange.length; index++) {
      const tr = this.sum(trueRange.slice(index - period + 1, index + 1));
      const plus = this.sum(plusDM.slice(index - period + 1, index + 1));
      const minus = this.sum(minusDM.slice(index - period + 1, index + 1));
      const plusDI = tr === 0 ? 0 : (plus / tr) * 100;
      const minusDI = tr === 0 ? 0 : (minus / tr) * 100;
      dx.push(
        plusDI + minusDI === 0
          ? 0
          : (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100,
      );
    }

    const adx = this.smaValues(dx, period);
    return {
      begIndex: period * 2 - 1,
      nbElement: adx.length,
      result: { outReal: adx },
    };
  }

  private fallbackSMA(values: number[], period: number) {
    const outReal = this.smaValues(values, period);
    return {
      begIndex: period - 1,
      nbElement: outReal.length,
      result: { outReal },
    };
  }

  private fallbackATR(
    high: number[],
    low: number[],
    close: number[],
    period: number,
  ) {
    const trueRange: number[] = [];
    for (let index = 0; index < close.length; index++) {
      trueRange.push(
        index === 0
          ? high[index] - low[index]
          : Math.max(
              high[index] - low[index],
              Math.abs(high[index] - close[index - 1]),
              Math.abs(low[index] - close[index - 1]),
            ),
      );
    }

    const outReal = this.smaValues(trueRange, period);
    return {
      begIndex: period - 1,
      nbElement: outReal.length,
      result: { outReal },
    };
  }

  private emaSeries(values: number[], period: number): number[] {
    const result = Array(values.length).fill(Number.NaN);
    if (values.length < period) return result;

    const multiplier = 2 / (period + 1);
    let previous = this.sum(values.slice(0, period)) / period;
    result[period - 1] = previous;
    for (let index = period; index < values.length; index++) {
      previous = (values[index] - previous) * multiplier + previous;
      result[index] = previous;
    }
    return result;
  }

  private smaValues(values: number[], period: number): number[] {
    if (!period || values.length < period) return [];
    const result: number[] = [];
    for (let index = period - 1; index < values.length; index++) {
      result.push(
        this.sum(values.slice(index - period + 1, index + 1)) / period,
      );
    }
    return result;
  }

  private rsiValue(averageGain: number, averageLoss: number): number {
    if (averageLoss === 0) return 100;
    const relativeStrength = averageGain / averageLoss;
    return 100 - 100 / (1 + relativeStrength);
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  async runMACD(prices: number[]): Promise<{
    begIndex: number;
    nbElement: number;
    macd: number[];
    signal: number[];
    histogram: number[];
  }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const macdResult = this.talib.execute({
      name: 'MACD',
      startIdx: 0,
      endIdx: prices.length - 1,
      inReal: prices,
      optInFastPeriod: 12,
      optInSlowPeriod: 26,
      optInSignalPeriod: 9,
    });
    return {
      begIndex: macdResult.begIndex,
      nbElement: macdResult.nbElement,
      macd: macdResult.result.outMACD,
      signal: macdResult.result.outMACDSignal,
      histogram: macdResult.result.outMACDHist,
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
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const rsiResult = this.talib.execute({
      name: 'RSI',
      startIdx: 0,
      endIdx: prices.length - 1,
      inReal: prices,
      optInTimePeriod: period,
    });

    return {
      begIndex: rsiResult.begIndex,
      nbElement: rsiResult.nbElement,
      rsi: rsiResult.result.outReal,
    };
  }

  async runKDJ(data: RunKDJDto): Promise<{
    begIndex: number;
    nbElement: number;
    K: number[];
    D: number[];
    J: number[];
  }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const stochasticResult = this.talib.execute({
      name: 'STOCH',
      startIdx: 0,
      endIdx: data.high.length - 1,
      high: data.high,
      low: data.low,
      close: data.close,
      optInFastK_Period: data.period || 9,
      optInSlowK_Period: data.kSmoothing || 3,
      optInSlowK_MAType: 0, // 简单移动平均
      optInSlowD_Period: data.dSmoothing || 3,
      optInSlowD_MAType: 0, // 简单移动平均
    });

    const K = stochasticResult.result.outSlowK;
    const D = stochasticResult.result.outSlowD;

    // 计算 J 线
    const J = K.map(
      (kValue: number, index: number) => 3 * kValue - 2 * D[index],
    );

    return {
      K,
      D,
      J,
      begIndex: stochasticResult.begIndex,
      nbElement: stochasticResult.nbElement,
    };
  }

  async runADX(data: RunADXDto): Promise<number[]> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const adxResult = this.talib.execute({
      name: 'ADX',
      startIdx: 0,
      endIdx: data.close.length - 1,
      high: data.high,
      low: data.low,
      close: data.close,
      optInTimePeriod: data.period || 14,
    });

    // talib返回的结果中，result.result.outReal 是ADX值数组
    // 前面 period*2-1 个值是null（因为ADX计算需要足够的数据）
    return adxResult.result.outReal;
  }

  async runDualMA(
    data: RunDualMADto,
  ): Promise<{ shortMA: number[]; longMA: number[] }> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 并行计算两条均线
    const [shortMAResult, longMA] = await Promise.all([
      this.talib.execute({
        name: 'SMA',
        startIdx: 0,
        endIdx: data.close.length - 1,
        inReal: data.close,
        optInTimePeriod: data.shortPeriod || 13,
      }),
      this.talib.execute({
        name: 'SMA',
        startIdx: 0,
        endIdx: data.close.length - 1,
        inReal: data.close,
        optInTimePeriod: data.longPeriod || 60,
      }),
    ]);

    return {
      shortMA: shortMAResult.result.outReal,
      longMA: longMA.result.outReal,
    };
  }

  async runATR(data: RunATRDto): Promise<number[]> {
    if (!this.talib) {
      throw new HttpException(
        ERROR_MESSAGES.INDICATOR_NOT_INITIALIZED,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const atrResult = this.talib.execute({
      name: 'ATR',
      startIdx: 0,
      endIdx: data.close.length - 1,
      high: data.high,
      low: data.low,
      close: data.close,
      optInTimePeriod: data.period || 14,
    });

    return atrResult.result.outReal;
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
        period: String(query.period) as unknown as Period,
        timestamp: Between(query.startDate, query.endDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });
    return foundKs;
  }
}
