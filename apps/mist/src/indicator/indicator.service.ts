import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { K, Security, Period } from '@app/shared-data';
import { CanonicalPolicyLoader } from '@app/strategy';
import {
  mapKToStrategyBar,
  readCanonicalRange,
  resolveSegments,
  type CanonicalSegmentRead,
  type CanonicalSegmentReader,
  type StrategyBar,
} from '@app/market-data';
import {
  computeMacdSeries,
  computeKdjSeries,
  computeAtrSeries,
  computeDualMaSeries,
} from '@app/indicators';

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

const K_ALIAS = 'k';
const K_ORDER = { ASC: 'ASC', DESC: 'DESC' } as const;
const K_PREDICATE = {
  SECURITY_ID: 'k.securityId = :securityId',
  SOURCE: 'k.source = :source',
  PERIOD: 'k.period = :period',
  FROM: 'k.timestamp >= :from',
  BEFORE: 'k.timestamp < :before',
  AFTER: 'k.timestamp > :after',
} as const;
const K_COLUMN = { TIMESTAMP: 'k.timestamp' } as const;

interface FindKDataQuery {
  code: string;
  period: Period;
  startDate: Date;
  endDate: Date;
}

@Injectable()
export class IndicatorService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(K)
    private kRepository: Repository<K>,
  ) {}

  private readonly canonicalSegmentReader: CanonicalSegmentReader = {
    read: (params) => this.readCanonicalSegment(params),
  };

  async runMACD(prices: number[]): Promise<{
    begIndex: number;
    nbElement: number;
    macd: number[];
    signal: number[];
    histogram: number[];
  }> {
    const { begIndex, macd, signal, histogram } = computeMacdSeries(
      prices.map(Number),
    );

    return {
      begIndex,
      nbElement: macd.length,
      macd,
      signal,
      histogram,
    };
  }

  async runKDJ(data: RunKDJDto): Promise<{
    begIndex: number;
    nbElement: number;
    K: number[];
    D: number[];
    J: number[];
  }> {
    const { begIndex, K, D, J } = computeKdjSeries(
      data.high.map(Number),
      data.low.map(Number),
      data.close.map(Number),
      {
        period: data.period,
        kSmoothing: data.kSmoothing,
        dSmoothing: data.dSmoothing,
      },
    );

    return {
      begIndex,
      nbElement: K.length,
      K,
      D,
      J,
    };
  }

  async runDualMA(
    data: RunDualMADto,
  ): Promise<{ shortMA: number[]; longMA: number[] }> {
    const { shortMA, longMA } = computeDualMaSeries(data.close.map(Number), {
      shortPeriod: data.shortPeriod,
      longPeriod: data.longPeriod,
    });
    return { shortMA, longMA };
  }

  async runATR(data: RunOhlcIndicatorDto): Promise<number[]> {
    const { atr } = computeAtrSeries(
      data.high.map(Number),
      data.low.map(Number),
      data.close.map(Number),
      data.period,
    );
    return atr;
  }

  /**
   * Find K-line data from database with optional data source selection.
   * This method provides read access to K-line data for indicators and Chan Theory.
   *
   * @param query - Query parameters including symbol, period, dates, and optional source
   * @returns Array of K entities
   */
  async findKData(query: FindKDataQuery): Promise<readonly StrategyBar[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: query.code,
    });
    if (!foundSecurity) {
      throw new HttpException(
        ERROR_MESSAGES.INDEX_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    const policy = CanonicalPolicyLoader.load();
    const segments = resolveSegments(policy, foundSecurity.code, query.period);

    return readCanonicalRange(this.canonicalSegmentReader, segments, {
      securityId: foundSecurity.id,
      period: query.period,
      startAt: query.startDate,
      endAt: query.endDate,
    });
  }

  private async readCanonicalSegment(
    params: CanonicalSegmentRead,
  ): Promise<readonly StrategyBar[]> {
    const query = this.kRepository
      .createQueryBuilder(K_ALIAS)
      .select([
        'k.source',
        'k.period',
        'k.timestamp',
        'k.open',
        'k.high',
        'k.low',
        'k.close',
        'k.volume',
        'k.amount',
      ])
      .addSelect('k.securityId')
      .where(K_PREDICATE.SECURITY_ID, {
        securityId: params.securityId,
      })
      .andWhere(K_PREDICATE.SOURCE, { source: params.source })
      .andWhere(K_PREDICATE.PERIOD, { period: params.period });

    if (params.from) {
      query.andWhere(K_PREDICATE.FROM, { from: params.from });
    }
    if (params.before) {
      query.andWhere(K_PREDICATE.BEFORE, { before: params.before });
    }
    if (params.afterTimestamp) {
      query.andWhere(K_PREDICATE.AFTER, { after: params.afterTimestamp });
    }

    query
      .orderBy(
        K_COLUMN.TIMESTAMP,
        params.order === 'asc' ? K_ORDER.ASC : K_ORDER.DESC,
      )
      .limit(params.limit);

    const rows = await query.getMany();
    return rows.map(mapKToStrategyBar);
  }
}
