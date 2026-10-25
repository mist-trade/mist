import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, isBacktestSource, K } from '@app/shared-data';
import { isValidDate } from '@app/utils';
import {
  loadCanonicalWindow,
  mapKToStrategyBar,
  readCanonicalPage,
  resolveSegments,
  type CanonicalSegmentRead,
  type CanonicalSegmentReader,
  type ReplayDataSelection,
  type ResolvedSegment,
  type StrategyBar,
  type StrategyHistorySource,
  type StrategyReplayMarketDataPort,
  type StrategyReplayPage,
  type StrategyReplayPageCriteria,
  type StrategyReplayWindow,
  type StrategyReplayWindowCriteria,
} from '@app/market-data';
import { CanonicalPolicyLoader } from '@app/strategy';
import { LessThan } from 'typeorm';
import type { Repository } from 'typeorm';

export const BACKTEST_REPLAY_PAGE_SIZE = 1_000;

const CANONICAL_SELECTION_KIND = 'canonical';
const REPLAY_ALIAS = 'k';
const REPLAY_ORDER = { ASC: 'ASC', DESC: 'DESC' } as const;
const REPLAY_PREDICATE = {
  SECURITY_ID: 'k.securityId = :securityId',
  SOURCE: 'k.source = :source',
  PERIOD: 'k.period = :period',
  START_AT: 'k.timestamp >= :startAt',
  END_AT: 'k.timestamp <= :endAt',
  AFTER_TIMESTAMP: 'k.timestamp > :afterTimestamp',
  FROM: 'k.timestamp >= :from',
  BEFORE: 'k.timestamp < :before',
  AFTER: 'k.timestamp > :after',
} as const;
const REPLAY_COLUMN = { TIMESTAMP: 'k.timestamp' } as const;

const REPLAY_BAR_COLUMNS = [
  'k.source',
  'k.period',
  'k.timestamp',
  'k.open',
  'k.high',
  'k.low',
  'k.close',
  'k.volume',
  'k.amount',
] as const;

/**
 * Replay market data for backtests.
 *
 * Canonical runs are assembled from the external splice policy: the caller never
 * picks a provider, and segments are read straight from `k`. The provider
 * variant only exists to replay runs created before the canonical contract.
 */
@Injectable()
export class BacktestMarketDataAdapter implements StrategyReplayMarketDataPort {
  private readonly segmentReader: CanonicalSegmentReader = {
    read: (params) => this.readSegment(params),
  };

  constructor(
    @InjectRepository(K) private readonly repository: Repository<K>,
  ) {}

  async loadReplayWindow(
    criteria: StrategyReplayWindowCriteria,
  ): Promise<StrategyReplayWindow> {
    assertWindowCriteria(criteria);

    if (criteria.selection.kind === CANONICAL_SELECTION_KIND) {
      const segments = resolveCanonicalSegments(criteria);
      const bars = await loadCanonicalWindow(this.segmentReader, segments, {
        securityId: criteria.securityId,
        period: criteria.period,
        endAt: criteria.endAt,
        requiredBars: criteria.requiredBars,
      });
      return { bars };
    }

    const rows = await this.repository.find({
      where: {
        securityId: criteria.securityId,
        source: toDataSource(criteria.selection.source),
        period: criteria.period,
        timestamp: LessThan(criteria.endAt),
      },
      order: { timestamp: 'DESC' },
      take: criteria.requiredBars,
    });
    return {
      bars: rows.reverse().map(mapKToStrategyBar),
    };
  }

  async readReplayPage(
    criteria: StrategyReplayPageCriteria,
  ): Promise<StrategyReplayPage> {
    assertCriteria(criteria);

    if (criteria.selection.kind === CANONICAL_SELECTION_KIND) {
      const segments = resolveCanonicalSegments(criteria);
      return readCanonicalPage(this.segmentReader, segments, {
        securityId: criteria.securityId,
        period: criteria.period,
        startAt: criteria.startAt,
        endAt: criteria.endAt,
        ...(criteria.afterTimestamp
          ? { afterTimestamp: criteria.afterTimestamp }
          : {}),
        limit: BACKTEST_REPLAY_PAGE_SIZE,
      });
    }

    const query = this.repository
      .createQueryBuilder(REPLAY_ALIAS)
      .select([...REPLAY_BAR_COLUMNS])
      .addSelect('k.securityId')
      .where(REPLAY_PREDICATE.SECURITY_ID, {
        securityId: criteria.securityId,
      })
      .andWhere(REPLAY_PREDICATE.SOURCE, {
        source: criteria.selection.source,
      })
      .andWhere(REPLAY_PREDICATE.PERIOD, { period: criteria.period })
      .andWhere(REPLAY_PREDICATE.START_AT, { startAt: criteria.startAt })
      .andWhere(REPLAY_PREDICATE.END_AT, { endAt: criteria.endAt });

    if (criteria.afterTimestamp) {
      query.andWhere(REPLAY_PREDICATE.AFTER_TIMESTAMP, {
        afterTimestamp: criteria.afterTimestamp,
      });
    }

    query
      .orderBy(REPLAY_COLUMN.TIMESTAMP, REPLAY_ORDER.ASC)
      .limit(BACKTEST_REPLAY_PAGE_SIZE);

    const rows = await query.getMany();
    const bars = rows.map(mapKToStrategyBar);
    return {
      bars,
      nextAfterTimestamp:
        bars.length === BACKTEST_REPLAY_PAGE_SIZE
          ? new Date(bars[bars.length - 1].timestamp.getTime())
          : null,
    };
  }

  private async readSegment(
    params: CanonicalSegmentRead,
  ): Promise<readonly StrategyBar[]> {
    const query = this.repository
      .createQueryBuilder(REPLAY_ALIAS)
      .select([...REPLAY_BAR_COLUMNS])
      .addSelect('k.securityId')
      .where(REPLAY_PREDICATE.SECURITY_ID, {
        securityId: params.securityId,
      })
      .andWhere(REPLAY_PREDICATE.SOURCE, { source: params.source })
      .andWhere(REPLAY_PREDICATE.PERIOD, { period: params.period });

    if (params.from) {
      query.andWhere(REPLAY_PREDICATE.FROM, { from: params.from });
    }
    if (params.before) {
      query.andWhere(REPLAY_PREDICATE.BEFORE, { before: params.before });
    }
    if (params.afterTimestamp) {
      query.andWhere(REPLAY_PREDICATE.AFTER, {
        after: params.afterTimestamp,
      });
    }

    query
      .orderBy(
        REPLAY_COLUMN.TIMESTAMP,
        params.order === 'asc' ? REPLAY_ORDER.ASC : REPLAY_ORDER.DESC,
      )
      .limit(params.limit);

    const rows = await query.getMany();
    return rows.map(mapKToStrategyBar);
  }
}

function resolveCanonicalSegments(
  criteria: StrategyReplayWindowCriteria | StrategyReplayPageCriteria,
): readonly ResolvedSegment[] {
  if (!criteria.securityCode) {
    throw new TypeError(
      'canonical replay requires securityCode to resolve the splice policy',
    );
  }
  const policy = CanonicalPolicyLoader.load();
  return resolveSegments(policy, criteria.securityCode, criteria.period);
}

function assertCriteria(criteria: StrategyReplayPageCriteria): void {
  if (!Number.isSafeInteger(criteria.securityId) || criteria.securityId <= 0) {
    throw new TypeError('replay securityId must be a positive safe integer');
  }
  if (!Number.isSafeInteger(criteria.period) || criteria.period <= 0) {
    throw new TypeError('replay period must be a positive safe integer');
  }
  assertSelection(criteria.selection);
  if (!isValidDate(criteria.startAt) || !isValidDate(criteria.endAt)) {
    throw new TypeError('replay range requires valid dates');
  }
  if (criteria.startAt > criteria.endAt) {
    throw new RangeError('replay startAt must not be after endAt');
  }
  if (criteria.afterTimestamp && !isValidDate(criteria.afterTimestamp)) {
    throw new TypeError('replay cursor requires a valid date');
  }
}

function assertWindowCriteria(criteria: StrategyReplayWindowCriteria): void {
  if (!Number.isSafeInteger(criteria.securityId) || criteria.securityId <= 0) {
    throw new TypeError(
      'replay window securityId must be a positive safe integer',
    );
  }
  if (!Number.isSafeInteger(criteria.period) || criteria.period <= 0) {
    throw new TypeError('replay window period must be a positive safe integer');
  }
  assertSelection(criteria.selection);
  if (!isValidDate(criteria.endAt)) {
    throw new TypeError('replay window endAt must be a valid date');
  }
  if (
    !Number.isSafeInteger(criteria.requiredBars) ||
    criteria.requiredBars <= 0
  ) {
    throw new TypeError(
      'replay window requiredBars must be a positive safe integer',
    );
  }
}

function assertSelection(selection: ReplayDataSelection): void {
  if (selection.kind === CANONICAL_SELECTION_KIND) return;
  if (!isBacktestSource(selection.source)) {
    throw new TypeError(
      'legacy replay source must be tdx, qmt or a vendor source',
    );
  }
}

function toDataSource(source: StrategyHistorySource): DataSource {
  return source as DataSource;
}
