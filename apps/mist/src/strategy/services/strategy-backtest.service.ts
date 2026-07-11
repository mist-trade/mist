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
import { Repository } from 'typeorm';
import { normalizeStrategyBacktestConfig } from '../backtest/strategy-backtest.engine';
import { StrategyBacktestConfig } from '../backtest/strategy-backtest.types';
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
        message: 'BACKTEST_DEFINITION_INELIGIBLE',
        errors: {
          backtestEnabled: ['Strategy backtesting is disabled'],
        },
      });
    }

    const versionId = dto.strategyVersionId ?? definition.currentVersionId;
    if (!versionId) {
      throw new BadRequestException({
        message: 'BACKTEST_VERSION_MISSING',
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
    this.assertRequestBounds(dto, definition, config);
    await this.assertConfiguredBenchmark(dto.source, config.benchmarkCode);

    const run = this.backtestRunRepository.create({
      strategyDefinitionId: definition.id,
      strategyVersionId: version.id,
      strategySnapshot: {
        entryRule: this.cloneRecord(version.entryRule),
        exitRule: version.exitRule ? this.cloneRecord(version.exitRule) : null,
        lookbackBars: version.lookbackBars,
        ruleSchemaVersion: version.ruleSchemaVersion,
        priceModel: 'forward_adjusted',
        limitations: [
          'dividends_not_modeled',
          'splits_not_modeled',
          'rights_issues_not_modeled',
          'full_price_limit_rules_not_modeled',
          'st_rules_not_modeled',
          'liquidity_not_modeled',
          'partial_fills_not_modeled',
        ],
      },
      targetUniverse: [...dto.targetUniverse],
      period: dto.period,
      source: dto.source,
      configSnapshot: {
        ...config,
        priceModel: 'forward_adjusted',
        executionAssumption: 'full_fill_at_adjusted_next_open',
      },
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
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
    const where: Record<string, unknown> = {};
    if (query.strategyDefinitionId !== undefined) {
      where.strategyDefinitionId = query.strategyDefinitionId;
    }
    if (query.status !== undefined) where.status = query.status;

    const runs = await this.backtestRunRepository.find({
      where: where as any,
      order: { createTime: 'DESC', id: 'DESC' },
    });
    return this.serializePage(
      this.paginate(runs, query, (run) => run.createTime, 'DESC'),
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

    const runningCancellation = await this.backtestRunRepository.update(
      { id: runId, status: BacktestRunStatus.RUNNING },
      { cancelRequestedAt: now },
    );
    if (runningCancellation.affected === 1) {
      return this.serialize(await this.findRunEntity(runId));
    }

    return this.serialize(await this.findRunEntity(runId));
  }

  async listSignals(
    runId: number,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestSignal>> {
    await this.findRunEntity(runId);
    const signals = await this.signalRepository.find({
      where: { backtestRunId: runId },
      order: { signalTime: 'ASC', id: 'ASC' },
    });
    return this.serializePage(
      this.paginate(signals, query, (signal) => signal.signalTime, 'ASC'),
    );
  }

  async listOrders(
    runId: number,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestOrder>> {
    await this.findRunEntity(runId);
    const orders = await this.orderRepository.find({
      where: { backtestRunId: runId },
      order: { scheduledTime: 'ASC', id: 'ASC' },
    });
    return this.serializePage(
      this.paginate(orders, query, (order) => order.scheduledTime, 'ASC'),
    );
  }

  async listTrades(
    runId: number,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestTrade>> {
    await this.findRunEntity(runId);
    const trades = await this.tradeRepository.find({
      where: { backtestRunId: runId },
      order: { entryTime: 'ASC', id: 'ASC' },
    });
    return this.serializePage(
      this.paginate(trades, query, (trade) => trade.entryTime, 'ASC'),
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
    asOf?: Date,
    query: BacktestFactListQuery = {},
  ): Promise<BacktestCursorPage<BacktestTrade>> {
    const run = await this.findRunEntity(runId);
    const latestEquityPoint = asOf
      ? undefined
      : await this.equityPointRepository.find({
          where: { backtestRunId: runId },
          order: { pointTime: 'DESC', id: 'DESC' },
          take: 1,
        });
    const effectiveAsOf =
      asOf ?? latestEquityPoint?.[0]?.pointTime ?? run.endDate;
    if (
      Number.isNaN(effectiveAsOf.getTime()) ||
      effectiveAsOf < run.startDate ||
      effectiveAsOf > run.endDate
    ) {
      throw new BadRequestException({
        message: 'BACKTEST_POSITION_AS_OF_INVALID',
        errors: { asOf: ['Date must be within the requested backtest range'] },
      });
    }

    const trades = await this.tradeRepository.find({
      where: { backtestRunId: runId },
      order: { entryTime: 'ASC', id: 'ASC' },
    });
    const positions = trades.filter(
      (trade) =>
        trade.entryTime <= effectiveAsOf &&
        (!trade.exitTime || trade.exitTime > effectiveAsOf),
    );
    return this.serializePage(
      this.paginate(positions, query, (trade) => trade.entryTime, 'ASC'),
    );
  }

  private assertEligibleVersion(version: StrategyVersion): void {
    if (!version.exitRule) {
      throw new BadRequestException({
        message: 'BACKTEST_VERSION_INELIGIBLE',
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
        message: 'BACKTEST_VERSION_INELIGIBLE',
        errors: {
          lookbackBars: [
            `At least ${requiredLookbackBars} bars are required by the selected rules`,
          ],
        },
      });
    }
  }

  private assertRequestBounds(
    dto: CreateBacktestRunDto,
    definition: StrategyDefinition,
    config: StrategyBacktestConfig,
  ): void {
    const errors: Record<string, string[]> = {};
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
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
        message: 'BACKTEST_REQUEST_INVALID',
        errors,
      });
    }
  }

  private assertConfig(
    config: StrategyBacktestConfig,
    errors: Record<string, string[]>,
  ): void {
    if (!Number.isFinite(config.initialCash) || config.initialCash <= 0) {
      errors.initialCash = ['Must be positive'];
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
    if (!Number.isFinite(config.minCommission) || config.minCommission < 0) {
      errors.minCommission = ['Must be non-negative'];
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
      message: 'BACKTEST_REQUEST_INVALID',
      errors: {
        benchmarkCode: [
          'Must be a configured index for the selected data source',
        ],
      },
    });
  }

  private cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  }

  private serializePage<T>(page: BacktestCursorPage<T>): BacktestCursorPage<T> {
    return {
      items: this.serialize(page.items),
      nextCursor: page.nextCursor,
    };
  }

  private serialize<T>(value: T): T {
    return this.serializeValue(value) as T;
  }

  private serializeValue(value: unknown, key?: string): unknown {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && key && BACKTEST_DECIMAL_FIELDS.has(key)) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    if (value instanceof Date) return new Date(value);
    if (Array.isArray(value))
      return value.map((item) => this.serializeValue(item));
    if (typeof value !== 'object' || value === null) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        this.serializeValue(item, key),
      ]),
    );
  }

  private paginate<T extends { id: number }>(
    items: T[],
    query: BacktestFactListQuery,
    getTime: (item: T) => Date,
    direction: 'ASC' | 'DESC',
  ): BacktestCursorPage<T> {
    const limit = this.normalizeLimit(query.limit);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const sorted = [...items].sort((left, right) => {
      const timeDiff = getTime(left).getTime() - getTime(right).getTime();
      const idDiff = left.id - right.id;
      return direction === 'ASC' ? timeDiff || idDiff : -(timeDiff || idDiff);
    });
    const afterCursor = cursor
      ? sorted.filter((item) => {
          const time = getTime(item).getTime();
          if (direction === 'ASC') {
            return (
              time > cursor.time ||
              (time === cursor.time && item.id > cursor.id)
            );
          }
          return (
            time < cursor.time || (time === cursor.time && item.id < cursor.id)
          );
        })
      : sorted;
    const pageItems = afterCursor.slice(0, limit);
    const lastItem = pageItems[pageItems.length - 1];

    return {
      items: pageItems,
      nextCursor:
        lastItem && afterCursor.length > pageItems.length
          ? this.encodeCursor(getTime(lastItem), lastItem.id)
          : null,
    };
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) return 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException({
        message: 'BACKTEST_PAGE_LIMIT_INVALID',
        errors: { limit: ['Must be an integer from 1 through 200'] },
      });
    }
    return limit;
  }

  private encodeCursor(time: Date, id: number): string {
    return Buffer.from(
      JSON.stringify({ time: time.getTime(), id }),
      'utf8',
    ).toString('base64url');
  }

  private decodeCursor(cursor: string): { time: number; id: number } {
    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as { time?: unknown; id?: unknown };
      if (
        typeof value.time !== 'number' ||
        typeof value.id !== 'number' ||
        !Number.isInteger(value.time) ||
        !Number.isInteger(value.id)
      ) {
        throw new Error('Invalid cursor fields');
      }
      return { time: value.time, id: value.id };
    } catch {
      throw new BadRequestException({
        message: 'BACKTEST_CURSOR_INVALID',
        errors: { cursor: ['Cursor is invalid'] },
      });
    }
  }
}
