import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { K } from '@app/shared-data';
import {
  createCanonicalStrategyBar,
  mapKToStrategyBar,
  loadCanonicalWindow,
  resolveSegments,
  type StrategyBar,
  type StrategyMarketObservation,
  type StrategyRealtimeMarketDataPort,
  type StrategyRealtimeWindow,
  type StrategyRealtimeWindowCriteria,
  type StrategyTrigger,
} from '@app/market-data';
import {
  CanonicalPolicyLoader,
  REALTIME_STRATEGY_PERIODS,
} from '@app/strategy';
import {
  closedCandleKey,
  decodeRealtimeClosedCandleRecordV1,
  type RealtimeClosedCandleRecordV1,
} from '@app/contracts';
import { isValidDate } from '@app/utils';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';
import { availabilityKey, deriveRightLabeledPeriodBars } from '@app/strategy';
import type {
  CanonicalSegmentRead,
  CanonicalSegmentReader,
} from '@app/market-data';
import { Repository } from 'typeorm';
import { SignalRealtimeRedisService } from './signal-realtime-redis.service';

const REALTIME_PERIODS = new Set<number>(REALTIME_STRATEGY_PERIODS);

@Injectable()
export class SignalStrategyMarketDataAdapter
  implements StrategyRealtimeMarketDataPort
{
  constructor(
    @InjectRepository(K) private readonly kRepository: Repository<K>,
    private readonly redis: SignalRealtimeRedisService,
  ) {}

  async resolveRealtimeObservation(
    trigger: StrategyTrigger,
  ): Promise<StrategyMarketObservation> {
    assertTrigger(trigger);
    if (trigger.outcome === 'discarded') {
      return Object.freeze({
        outcome: 'discarded',
        securityId: trigger.securityId,
        source: trigger.source,
        period: 1,
        timestamp: new Date(trigger.timestamp.getTime()),
      });
    }
    const tradingDay = shanghaiTradingDay(trigger.timestamp);
    const raw = await this.redis.client.hget(
      closedCandleKey(tradingDay, trigger.source, trigger.securityId),
      String(trigger.timestamp.getTime()),
    );
    if (raw === null) {
      throw new Error('sealed realtime candle record is missing');
    }
    const record = decodeRealtimeClosedCandleRecordV1(parseJson(raw));
    return Object.freeze({
      outcome: 'sealed',
      bar: mapClosedRecord(trigger, record),
    });
  }

  /**
   * R2 数据接缝：历史段（触发日之前）走 canonical 拼接源（与回测同源），
   * 当日段只来自触发源（Redis 封存 1m + 右标派生）。policy 未覆盖该周期时
   * 显式失败（fail-closed），绝不空窗兜底或跨源回退。
   */
  async loadRealtimeWindow(
    criteria: StrategyRealtimeWindowCriteria,
  ): Promise<StrategyRealtimeWindow> {
    assertCriteria(criteria);
    const hydrationBarLimit = criteria.requiredBars;
    const tradingDay = shanghaiTradingDay(criteria.anchorAt);
    const dayStart = shanghaiDayStart(tradingDay);
    const redisBars = await this.loadCurrentDayBars(criteria, tradingDay);
    const historicalNeeded = Math.max(0, hydrationBarLimit - redisBars.length);
    const historical =
      historicalNeeded === 0
        ? []
        : await this.loadCanonicalHistory(criteria, historicalNeeded, dayStart);
    const bars = [...historical, ...redisBars];
    return Object.freeze({
      bars: Object.freeze(bars.slice(-hydrationBarLimit)),
    });
  }

  private async loadCanonicalHistory(
    criteria: StrategyRealtimeWindowCriteria,
    requiredBars: number,
    dayStart: Date,
  ): Promise<readonly StrategyBar[]> {
    const securityCode =
      criteria.securityCode ??
      (await this.resolveSecurityCode(criteria.securityId));
    const policy = CanonicalPolicyLoader.load();
    // policy 未覆盖该周期 → resolveSegments 抛 CanonicalDataError（显式失败）
    const segments = resolveSegments(policy, securityCode, criteria.period);
    return loadCanonicalWindow(this.canonicalSegmentReader, segments, {
      securityId: criteria.securityId,
      period: criteria.period,
      endAt: dayStart,
      requiredBars,
    });
  }

  private readonly canonicalSegmentReader: CanonicalSegmentReader = {
    read: (params: CanonicalSegmentRead) => this.readCanonicalSegment(params),
  };

  private async readCanonicalSegment(
    params: CanonicalSegmentRead,
  ): Promise<readonly StrategyBar[]> {
    const query = this.kRepository
      .createQueryBuilder('k')
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
      .where('k.securityId = :securityId', { securityId: params.securityId })
      .andWhere('k.source = :source', { source: params.source })
      .andWhere('k.period = :period', { period: params.period });
    if (params.from) {
      query.andWhere('k.timestamp >= :from', { from: params.from });
    }
    if (params.before) {
      query.andWhere('k.timestamp < :before', { before: params.before });
    }
    if (params.afterTimestamp) {
      query.andWhere('k.timestamp > :after', { after: params.afterTimestamp });
    }
    query
      .orderBy('k.timestamp', params.order === 'asc' ? 'ASC' : 'DESC')
      .limit(params.limit);
    const rows = await query.getMany();
    return rows.map(mapKToStrategyBar);
  }

  private async resolveSecurityCode(securityId: number): Promise<string> {
    const cached = this.securityCodeCache.get(securityId);
    if (cached) return cached;
    const row = await this.kRepository
      .createQueryBuilder('k')
      .leftJoin('k.security', 'security')
      .addSelect('security.code', 'code')
      .where('k.securityId = :securityId', { securityId })
      .limit(1)
      .getRawOne<{ code: string }>();
    if (!row?.code) {
      throw new Error(`security ${securityId} not found for canonical policy`);
    }
    this.securityCodeCache.set(securityId, row.code);
    return row.code;
  }

  private readonly securityCodeCache = new Map<number, string>();

  private async loadCurrentDayBars(
    criteria: StrategyRealtimeWindowCriteria,
    tradingDay: string,
  ): Promise<readonly StrategyBar[]> {
    const values = await this.redis.client.hgetall(
      closedCandleKey(tradingDay, criteria.source, criteria.securityId),
    );
    const anchorAvailabilityMs = criteria.anchorAvailabilityMs;
    const oneMinuteBars = Object.entries(values)
      .map(([timestampText, raw]) => {
        const timestampMs = Number(timestampText);
        if (!Number.isSafeInteger(timestampMs)) {
          throw new TypeError('closed-candle hash field must be epoch ms');
        }
        const trigger: StrategyTrigger = {
          securityId: criteria.securityId,
          source: criteria.source,
          period: 1,
          timestamp: new Date(timestampMs),
          outcome: 'sealed',
        };
        return mapClosedRecord(
          trigger,
          decodeRealtimeClosedCandleRecordV1(parseJson(raw)),
        );
      })
      .filter(
        (bar) =>
          shanghaiTradingDay(bar.timestamp) === tradingDay &&
          availabilityKey(bar).getTime() < anchorAvailabilityMs,
      )
      .sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
    if (criteria.period === 1) return oneMinuteBars;
    // 右标派生（与增量 RealtimePeriodBuilder 语义一致），可用时刻过滤：
    // 进行中 slot 与将由当前触发闭合的 bar 不得注入
    return deriveRightLabeledPeriodBars(
      oneMinuteBars,
      criteria.period as 5 | 15 | 30 | 60 | 1440,
      { anchorAvailabilityMs },
    );
  }
}

function mapClosedRecord(
  trigger: StrategyTrigger,
  record: RealtimeClosedCandleRecordV1,
): StrategyBar {
  return createCanonicalStrategyBar({
    securityId: trigger.securityId,
    source: trigger.source,
    period: 1,
    timestamp: trigger.timestamp,
    open: record.o,
    high: record.h,
    low: record.l,
    close: record.c,
    volume: record.v,
    amount: record.a,
    type: 'complete',
  });
}

function shanghaiTradingDay(timestamp: Date): string {
  const parts = shanghaiParts(timestamp);
  return `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`;
}

function shanghaiDayStart(tradingDay: string): Date {
  return fromZonedTime(
    `${tradingDay.slice(0, 4)}-${tradingDay.slice(4, 6)}-${tradingDay.slice(6, 8)}T00:00:00.000`,
    ASIA_SHANGHAI_TIMEZONE,
  );
}

function shanghaiParts(timestamp: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  if (!isValidDate(timestamp)) {
    throw new TypeError('realtime K timestamp must be valid');
  }
  const zoned = toZonedTime(timestamp, ASIA_SHANGHAI_TIMEZONE);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
  };
}

function assertTrigger(trigger: StrategyTrigger): void {
  if (
    !Number.isSafeInteger(trigger.securityId) ||
    trigger.securityId <= 0 ||
    trigger.period !== 1 ||
    trigger.timestamp.getTime() % 60_000 !== 0
  ) {
    throw new TypeError('Invalid realtime strategy trigger');
  }
}

function assertCriteria(criteria: StrategyRealtimeWindowCriteria): void {
  if (
    !Number.isSafeInteger(criteria.securityId) ||
    criteria.securityId <= 0 ||
    !REALTIME_PERIODS.has(criteria.period) ||
    !Number.isSafeInteger(criteria.requiredBars) ||
    criteria.requiredBars <= 0 ||
    criteria.requiredBars > 800 ||
    criteria.anchorAt.getTime() % 60_000 !== 0
  ) {
    throw new TypeError('Invalid realtime window criteria');
  }
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
