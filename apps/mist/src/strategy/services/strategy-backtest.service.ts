import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BacktestEquityPoint,
  BacktestOrder,
  BacktestRun,
  BacktestRunStage,
  BacktestRunStatus,
  BacktestSignal,
  BacktestTrade,
  DataSource,
  Period,
  SecuritySourceConfig,
  SecurityType,
  StrategyDefinition,
  StrategyVersion,
} from '@app/shared-data';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { TimezoneService } from '@app/timezone';
import {
  isStrategyBacktestSource,
  MARKET_DATA_FINGERPRINT_ALGORITHM,
  MAX_BACKTEST_CNY,
  STRATEGY_BACKTEST_ERROR_CODES,
  strategyBacktestPriceModel,
} from '../backtest/strategy-backtest.constants';
import { normalizeStrategyBacktestConfig } from '../backtest/strategy-backtest.engine';
import { StrategyBacktestConfig } from '../backtest/strategy-backtest.types';
import { cloneJsonRecord } from '../backtest/strategy-backtest.utils';
import { CreateBacktestRunDto } from '../dto/create-backtest-run.dto';
import { StrategyRuleValidator } from '../rules/strategy-rule-validator';

export type BacktestCursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

type BacktestRunListQuery = {
  strategyDefinitionId?: number;
  status?: BacktestRunStatus;
  cursor?: string;
  limit?: number;
};

type BacktestFactListQuery = {
  cursor?: string;
  limit?: number;
};

type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? Date
    : T extends Array<infer Item>
      ? Array<Serialized<Item>>
      : T extends object
        ? { [Key in keyof T]: Serialized<T[Key]> }
        : T;

const BACKTEST_DECIMAL_FIELDS = new Set([
  'progressPercent',
  'fillPrice',
  'grossAmount',
  'commission',
  'stampDuty',
  'transferFee',
  'totalFee',
  'entryPrice',
  'exitPrice',
  'entryFee',
  'exitFee',
  'realizedPnl',
  'cash',
  'marketValue',
  'equity',
  'benchmarkValue',
  'drawdown',
  'exposure',
]);

// JSON columns that carry arbitrary nested payloads (snapshots, metrics,
// diagnostic blobs). The serializer must NOT recurse into these with
// decimal-field coercion: a diagnostic string like
// { errorDetails: { commission: "provider unavailable" } } would otherwise be
// silently turned into { commission: null }, destroying the original text.
const BACKTEST_JSON_BLOB_FIELDS = new Set([
  'strategySnapshot',
  'configSnapshot',
  'metrics',
  'errorDetails',
  'contextSnapshot',
  'ruleSnapshot',
]);

@Injectable()
export class StrategyBacktestService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(BacktestRun)
    private readonly backtestRunRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignal)
    private readonly signalRepository: Repository<BacktestSignal>,
    @InjectRepository(BacktestOrder)
    private readonly orderRepository: Repository<BacktestOrder>,
    @InjectRepository(BacktestTrade)
    private readonly tradeRepository: Repository<BacktestTrade>,
    @InjectRepository(BacktestEquityPoint)
    private readonly equityPointRepository: Repository<BacktestEquityPoint>,
    @InjectRepository(SecuritySourceConfig)
    private readonly securitySourceConfigRepository: Repository<SecuritySourceConfig>,
    private readonly ruleValidator: StrategyRuleValidator,
    private readonly timezoneService: TimezoneService,
  ) {}

  async createRun(dto: CreateBacktestRunDto): Promise<BacktestRun> {
    const definition = await this.definitionRepository.findOne({
      where: { id: dto.strategyDefinitionId },
    });
    if (!definition) {
      throw new NotFoundException(
        `Strategy definition ${dto.strategyDefinitionId} not found`,
      );
    }
    if (!definition.backtestEnabled) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.DEFINITION_INELIGIBLE,
        errors: {
          backtestEnabled: ['Strategy backtesting is disabled'],
        },
      });
    }

    const versionId = dto.strategyVersionId ?? definition.currentVersionId;
    if (!versionId) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.VERSION_MISSING,
        errors: {
          strategyVersionId: ['No current strategy version is configured'],
        },
      });
    }
    const version = await this.versionRepository.findOne({
      where: { id: versionId, strategyDefinitionId: definition.id },
    });
    if (!version || version.strategyDefinitionId !== definition.id) {
      throw new NotFoundException(`Strategy version ${versionId} not found`);
    }

    const config = normalizeStrategyBacktestConfig({
      initialCash: dto.initialCash,
      maxPositions: dto.maxPositions,
      slippageBps: dto.slippageBps,
      commissionRate: dto.commissionRate,
      minCommission: dto.minCommission,
      stampDutyRate: dto.stampDutyRate,
      transferFeeRate: dto.transferFeeRate,
      benchmarkCode: dto.benchmarkCode,
    });
    this.assertEligibleVersion(version);
    // Parse dates exactly once (Beijing midnight) and reuse for both bounds
    // checking and persistence, so validation and the stored run cannot diverge.
    const startDate = this.parseDateOnce(dto.startDate);
    const endDate = this.parseDateOnce(dto.endDate);
    this.assertRequestBounds(dto, definition, config, startDate, endDate);
    await this.assertConfiguredBenchmark(dto.source, config.benchmarkCode);
    const priceModel = strategyBacktestPriceModel(dto.source);

    const run = this.backtestRunRepository.create({
      strategyDefinitionId: definition.id,
      strategyVersionId: version.id,
      strategySnapshot: {
        entryRule: cloneJsonRecord(version.entryRule),
        exitRule: version.exitRule ? cloneJsonRecord(version.exitRule) : null,
        lookbackBars: version.lookbackBars,
        ruleSchemaVersion: version.ruleSchemaVersion,
      },
      targetUniverse: [...dto.targetUniverse],
      period: dto.period,
      source: dto.source,
      configSnapshot: {
        ...config,
        priceModel,
        // Document the provenance of the price-model claim so operators know
        // the QMT marker is an ingestion-contract declaration, not an
        // independent provider attestation.
        priceModelProvenance:
          dto.source === DataSource.QMT
            ? 'qmt_effective_dividend_type_request_contract'
            : 'tdx_forward_factor_request_contract',
        limitations: [
          'dividends_not_modeled',
          'splits_not_modeled',
          'rights_issues_not_modeled',
          'full_price_limit_rules_not_modeled',
          'st_rules_not_modeled',
          'liquidity_not_modeled',
          'partial_fills_not_modeled',
        ],
        executionAssumption: 'full_fill_at_adjusted_next_open',
        marketDataFingerprintAlgorithm: MARKET_DATA_FINGERPRINT_ALGORITHM,
      },
      startDate,
      endDate,
      status: BacktestRunStatus.PENDING,
      stage: BacktestRunStage.QUEUED,
      signalCount: 0,
      matchedSecurityCount: 0,
      processedWork: 0,
      totalWork: 0,
      progressPercent: 0,
      attemptCount: 0,
      metrics: null,
      errorCode: null,
      errorDetails: null,
    });

    return this.serialize(await this.backtestRunRepository.save(run));
  }

  async listRuns(
    query: BacktestRunListQuery = {},
  ): Promise<BacktestCursorPage<BacktestRun>> {
    const builder = this.backtestRunRepository
      .createQueryBuilder('run')
      .where('1 = 1');
    if (query.strategyDefinitionId !== undefined) {
      builder.andWhere('run.strategyDefinitionId = :strategyDefinitionId', {
        strategyDefinitionId: query.strategyDefinitionId,
      });
    }
    if (query.status !== undefined) {
      builder.andWhere('run.status = :status', { status: query.status });
    }

    return this.serializePage(
      await this.queryCursorPage(builder, 'run', 'createTime', 'DESC', query),
    );
  }

  async findRun(runId: number): Promise<BacktestRun> {
    return this.serialize(await this.findRunEntity(runId));
  }

  private async findRunEntity(runId: number): Promise<BacktestRun> {
    const run = await this.backtestRunRepository.findOne({
      where: { id: runId },
    });
    if (!run) {
      throw new NotFoundException(`Backtest run ${runId} not found`);
    }
    return run;
  }

  async cancelRun(runId: number): Promise<BacktestRun> {
    const now = new Date();
    const pendingCancellation = await this.backtestRunRepository.update(
      { id: runId, status: BacktestRunStatus.PENDING },
      {
        status: BacktestRunStatus.CANCELLED,
        stage: BacktestRunStage.FINALIZING,
        cancelRequestedAt: now,
        completedAt: now,
      },
    );
    if (pendingCancellation.affected === 1) {
      return this.serialize(await this.findRunEntity(runId));
    }

    await this.backtestRunRepository.update(
      { id: runId, status: BacktestRunStatus.RUNNING },
      { cancelRequestedAt: now },
    );
    return this.serialize(await this.findRunEntity(runId));
  }

  async listSignals(
    runId: number,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestSignal>> {
    await this.findRunEntity(runId);
    const builder = this.signalRepository
      .createQueryBuilder('signal')
      .where('signal.backtestRunId = :runId', { runId });
    return this.serializePage(
      await this.queryCursorPage(builder, 'signal', 'signalTime', 'ASC', query),
    );
  }

  async listOrders(
    runId: number,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestOrder>> {
    await this.findRunEntity(runId);
    const builder = this.orderRepository
      .createQueryBuilder('order')
      .where('order.backtestRunId = :runId', { runId });
    return this.serializePage(
      await this.queryCursorPage(
        builder,
        'order',
        'scheduledTime',
        'ASC',
        query,
      ),
    );
  }

  async listTrades(
    runId: number,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestTrade>> {
    await this.findRunEntity(runId);
    const builder = this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.backtestRunId = :runId', { runId });
    return this.serializePage(
      await this.queryCursorPage(builder, 'trade', 'entryTime', 'ASC', query),
    );
  }

  async listEquity(runId: number): Promise<BacktestEquityPoint[]> {
    await this.findRunEntity(runId);
    return this.serialize(
      await this.equityPointRepository.find({
        where: { backtestRunId: runId },
        order: { pointTime: 'ASC', id: 'ASC' },
      }),
    );
  }

  async listPositions(
    runId: number,
    asOf?: string,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestTrade>> {
    const run = await this.findRunEntity(runId);
    const parsedAsOf =
      asOf === undefined
        ? undefined
        : this.timezoneService.parseDateString(asOf);
    const latestEquityPoint = parsedAsOf
      ? undefined
      : await this.equityPointRepository.find({
          where: { backtestRunId: runId },
          order: { pointTime: 'DESC', id: 'DESC' },
          take: 1,
        });
    const effectiveAsOf =
      parsedAsOf ?? latestEquityPoint?.[0]?.pointTime ?? run.endDate;
    if (
      Number.isNaN(effectiveAsOf.getTime()) ||
      effectiveAsOf < run.startDate ||
      effectiveAsOf > run.endDate
    ) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.POSITION_AS_OF_INVALID,
        errors: { asOf: ['Date must be within the requested backtest range'] },
      });
    }

    const builder = this.tradeRepository
      .createQueryBuilder('trade')
      .where('trade.backtestRunId = :runId', { runId })
      .andWhere('trade.entryTime <= :asOf', { asOf: effectiveAsOf })
      .andWhere('(trade.exitTime IS NULL OR trade.exitTime > :asOf)', {
        asOf: effectiveAsOf,
      });
    return this.serializePage(
      await this.queryCursorPage(builder, 'trade', 'entryTime', 'ASC', query),
    );
  }

  private assertEligibleVersion(version: StrategyVersion): void {
    if (!version.exitRule) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.VERSION_INELIGIBLE,
        errors: { exitRule: ['Backtesting requires an exit rule'] },
      });
    }

    const entrySummary = this.ruleValidator.validate(version.entryRule);
    const exitSummary = this.ruleValidator.validate(version.exitRule);
    const requiredLookbackBars = Math.max(
      entrySummary.requiredLookbackBars,
      exitSummary.requiredLookbackBars,
    );
    if (version.lookbackBars < requiredLookbackBars) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.VERSION_INELIGIBLE,
        errors: {
          lookbackBars: [
            `At least ${requiredLookbackBars} bars are required by the selected rules`,
          ],
        },
      });
    }
  }

  /**
   * Parse a Beijing-calendar date string once. The DTO already validated the
   * shape via BEIJING_DATE_REGEX; parseDateString re-validates and converts to
   * a Date at Beijing midnight. Throws on invalid input so callers cannot
   * silently persist a NaN date.
   */
  private parseDateOnce(value: string): Date {
    return this.timezoneService.parseDateString(value);
  }

  private assertRequestBounds(
    dto: CreateBacktestRunDto,
    definition: StrategyDefinition,
    config: StrategyBacktestConfig,
    startDate: Date,
    endDate: Date,
  ): void {
    const errors: Record<string, string[]> = {};
    if (dto.targetUniverse.length < 1 || dto.targetUniverse.length > 50) {
      errors.targetUniverse = ['Must contain between 1 and 50 security codes'];
    }
    if (new Set(dto.targetUniverse).size !== dto.targetUniverse.length) {
      errors.targetUniverse = [
        ...(errors.targetUniverse ?? []),
        'Security codes must be unique',
      ];
    }
    if (dto.targetUniverse.some((code) => !/^\d{6}$/.test(code))) {
      errors.targetUniverse = [
        ...(errors.targetUniverse ?? []),
        'Security codes must be canonical six-digit codes',
      ];
    }
    if (dto.period !== Period.DAY) {
      errors.period = ['Only daily backtests are supported'];
    }
    if (!definition.periods.includes(Period.DAY)) {
      errors.period = [
        ...(errors.period ?? []),
        'Strategy definition is not configured for daily bars',
      ];
    }
    if (!definition.sources.includes(dto.source)) {
      errors.source = ['Source is not configured on the strategy definition'];
    }
    if (!isStrategyBacktestSource(dto.source)) {
      errors.source = [
        ...(errors.source ?? []),
        'Only tdx and qmt backtest sources are supported',
      ];
    }
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      errors.dateRange = ['Start and end dates must be valid'];
    } else {
      const maximumEndDate = new Date(startDate);
      maximumEndDate.setUTCFullYear(maximumEndDate.getUTCFullYear() + 10);
      if (endDate < startDate) {
        errors.dateRange = ['End date must not be before start date'];
      } else if (endDate > maximumEndDate) {
        errors.dateRange = ['Date range must not exceed 10 years'];
      }
    }

    this.assertConfig(config, errors);
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.REQUEST_INVALID,
        errors,
      });
    }
  }

  private assertConfig(
    config: StrategyBacktestConfig,
    errors: Record<string, string[]>,
  ): void {
    if (
      !Number.isFinite(config.initialCash) ||
      config.initialCash <= 0 ||
      config.initialCash > MAX_BACKTEST_CNY
    ) {
      errors.initialCash = ['Must be positive and within the supported range'];
    }
    if (
      !Number.isInteger(config.maxPositions) ||
      config.maxPositions < 1 ||
      config.maxPositions > 50
    ) {
      errors.maxPositions = ['Must be an integer from 1 through 50'];
    }
    if (
      !Number.isFinite(config.slippageBps) ||
      config.slippageBps < 0 ||
      config.slippageBps > 10_000
    ) {
      errors.slippageBps = ['Must be from 0 through 10000'];
    }
    if (
      !Number.isFinite(config.minCommission) ||
      config.minCommission < 0 ||
      config.minCommission > MAX_BACKTEST_CNY
    ) {
      errors.minCommission = [
        'Must be non-negative and within the supported range',
      ];
    }
    for (const field of [
      'commissionRate',
      'stampDutyRate',
      'transferFeeRate',
    ] as const) {
      if (
        !Number.isFinite(config[field]) ||
        config[field] < 0 ||
        config[field] > 1
      ) {
        errors[field] = ['Must be from 0 through 1'];
      }
    }
    if (!/^\d{6}$/.test(config.benchmarkCode)) {
      errors.benchmarkCode = ['Must be a canonical six-digit index code'];
    }
  }

  private async assertConfiguredBenchmark(
    source: DataSource,
    benchmarkCode: string,
  ): Promise<void> {
    const sourceConfig = await this.securitySourceConfigRepository.findOne({
      where: {
        source,
        enabled: true,
        security: { code: benchmarkCode, type: SecurityType.INDEX },
      },
      relations: ['security'],
    });
    if (sourceConfig) return;

    throw new BadRequestException({
      message: STRATEGY_BACKTEST_ERROR_CODES.REQUEST_INVALID,
      errors: {
        benchmarkCode: [
          'Must be a configured index for the selected data source',
        ],
      },
    });
  }

  private serializePage<T>(
    page: BacktestCursorPage<T>,
  ): BacktestCursorPage<Serialized<T>> {
    return {
      items: this.serialize(page.items),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Normalize an entity (or page of entities) for JSON serialization.
   *
   * Entity-row leaf transforms:
   *   bigint  -> string  (JSON has no bigint)
   *   NaN/Inf -> null    (JSON has no NaN/Infinity)
   *   Date    -> copy    (avoid shared mutable references)
   *   decimal-string columns (mysql decimal comes back as string) -> number
   *
   * JSON-blob columns (snapshots, metrics, errorDetails, ...) get only the
   * type-safe transforms (bigint->string, NaN/Inf->null, Date->copy) applied
   * recursively, but NEVER the decimal-field-name coercion: a diagnostic
   * string like { commission: "provider unavailable" } must survive intact
   * rather than being silently turned into { commission: null }.
   *
   * The mapped return type reflects bigint-to-string conversion instead of
   * pretending that the serialized body is still the original entity type.
   */
  private serialize<T>(value: T): Serialized<T> {
    return this.serializeValue(value) as Serialized<T>;
  }

  private serializeValue(
    value: unknown,
    key?: string,
    coerceDecimalFields = true,
  ): unknown {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) return new Date(value);
    if (
      coerceDecimalFields &&
      typeof value === 'string' &&
      key &&
      BACKTEST_DECIMAL_FIELDS.has(key)
    ) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    if (Array.isArray(value))
      return value.map((item) =>
        this.serializeValue(item, undefined, coerceDecimalFields),
      );
    if (typeof value !== 'object' || value === null) return value;

    return Object.fromEntries(
      Object.entries(value).map(([childKey, item]) => [
        childKey,
        this.serializeValue(
          item,
          childKey,
          coerceDecimalFields && !BACKTEST_JSON_BLOB_FIELDS.has(childKey),
        ),
      ]),
    );
  }

  private async queryCursorPage<T extends { id: number }>(
    builder: SelectQueryBuilder<T>,
    alias: string,
    timeProperty: string,
    direction: 'ASC' | 'DESC',
    query: BacktestFactListQuery,
  ): Promise<BacktestCursorPage<T>> {
    const limit = this.normalizeLimit(query.limit);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const timeExpression = `${alias}.${timeProperty}`;
    if (cursor) {
      const comparator = direction === 'ASC' ? '>' : '<';
      builder.andWhere(
        `(${timeExpression} ${comparator} :cursorTime OR (${timeExpression} = :cursorTime AND ${alias}.id ${comparator} :cursorId))`,
        { cursorTime: cursor.time, cursorId: cursor.id },
      );
    }

    const result = await builder
      .orderBy(timeExpression, direction)
      .addOrderBy(`${alias}.id`, direction)
      .addSelect(
        `DATE_FORMAT(${timeExpression}, '%Y-%m-%d %H:%i:%s.%f')`,
        'backtest_cursor_time',
      )
      .take(limit + 1)
      .getRawAndEntities();
    const hasNextPage = result.entities.length > limit;
    const pageItems = result.entities.slice(0, limit);
    let nextCursor: string | null = null;

    if (hasNextPage) {
      const lastIndex = pageItems.length - 1;
      const cursorTime = result.raw[lastIndex]?.backtest_cursor_time;
      const lastItem = pageItems[lastIndex];
      if (typeof cursorTime !== 'string' || !lastItem) {
        throw new Error('Backtest cursor timestamp was not returned by MySQL');
      }
      nextCursor = this.encodeCursor(cursorTime, lastItem.id);
    }

    return {
      items: pageItems,
      nextCursor,
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) return 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.PAGE_LIMIT_INVALID,
        errors: { limit: ['Must be an integer from 1 through 200'] },
      });
    }
    return limit;
  }

  private encodeCursor(time: string, id: number): string {
    return Buffer.from(JSON.stringify({ time, id }), 'utf8').toString(
      'base64url',
    );
  }

  private decodeCursor(cursor: string): { time: string; id: number } {
    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { time?: unknown; id?: unknown };
      if (
        typeof value.time !== 'string' ||
        typeof value.id !== 'number' ||
        !this.isMysqlDatetime6(value.time) ||
        !Number.isInteger(value.id) ||
        value.id < 1
      ) {
        throw new Error('Invalid cursor fields');
      }
      return { time: value.time, id: value.id };
    } catch {
      throw new BadRequestException({
        message: STRATEGY_BACKTEST_ERROR_CODES.CURSOR_INVALID,
        errors: { cursor: ['Cursor is invalid'] },
      });
    }
  }

  private isMysqlDatetime6(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(value)) {
      return false;
    }
    const millisecondValue = value.slice(0, 23);
    const parsed = new Date(`${millisecondValue.replace(' ', 'T')}Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 23).replace('T', ' ') === millisecondValue
    );
  }
}
