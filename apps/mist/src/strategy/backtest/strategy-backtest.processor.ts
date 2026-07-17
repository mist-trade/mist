import { createHash } from 'node:crypto';
import {
  BacktestEquityPoint,
  BacktestOrder,
  BacktestRun,
  BacktestRunStage,
  BacktestRunStatus,
  BacktestSignal,
  BacktestTrade,
  DataSource as MarketDataSource,
  K,
  KExtensionQmt,
  Period,
  SecurityType,
  StrategyRuleSchemaVersion,
} from '@app/shared-data';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource as TypeOrmDataSource,
  EntityManager,
  EntityTarget,
  In,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import {
  isStrategyBacktestSource,
  MARKET_DATA_FINGERPRINT_ALGORITHM,
  MAX_BACKTEST_CNY,
  QMT_FRONT_RATIO_DIVIDEND_TYPE,
  STRATEGY_BACKTEST_ERROR_CODES,
  type StrategyBacktestErrorCode,
  strategyBacktestPriceModel,
} from './strategy-backtest.constants';
import { StrategyBacktestEngine } from './strategy-backtest.engine';
import {
  StrategyBacktestBar,
  StrategyBacktestConfig,
  StrategyBacktestInput,
  StrategyBacktestOutput,
} from './strategy-backtest.types';

const FACT_BATCH_SIZE = 500;
const ENGINE_DATE_BATCH_SIZE = 25;
const LEASE_DURATION_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
// Cap on IDs per QMT marker lookup batch. MySQL handles IN-lists of a few
// thousand comfortably; this keeps the largest 50×10y universe (≈130k ids)
// chunked across lease-renewed batches instead of one giant query.
const QMT_MARKER_BATCH_SIZE = 1_000;
const K_LOAD_BATCH_SIZE = 2_000;
const WARMUP_HEARTBEAT_INTERVAL = 5;
const FINGERPRINT_YIELD_BATCH_SIZE = 5_000;

type StrategySnapshot = {
  entryRule: Record<string, unknown>;
  exitRule: Record<string, unknown> | null;
  lookbackBars: number;
  ruleSchemaVersion: StrategyRuleSchemaVersion;
};

type MarketData = {
  bars: StrategyBacktestBar[];
  benchmarkBars: StrategyBacktestBar[];
};

type SelectedMarketRow = {
  role: 'target' | 'benchmark';
  row: K;
};

type FingerprintCanonicalRow = {
  amount: number;
  close: number;
  high: number;
  low: number;
  open: number;
  period: number;
  role: SelectedMarketRow['role'];
  securityCode: string;
  securityType: string;
  source: string;
  timestamp: string;
  volume: number;
};

class BacktestProcessingError extends Error {
  constructor(
    readonly code: StrategyBacktestErrorCode,
    readonly details: Record<string, unknown>,
  ) {
    super(code);
  }
}

class BacktestCancelledError extends Error {}

class BacktestLeaseLostError extends Error {
  constructor() {
    super(STRATEGY_BACKTEST_ERROR_CODES.LEASE_LOST);
  }
}

@Injectable()
export class StrategyBacktestProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(StrategyBacktestProcessor.name);
  private readonly leaseOwner = `mist-backtest-${process.pid}-${Math.random()
    .toString(36)
    .slice(2)}`;
  private processing = false;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    @InjectDataSource()
    private readonly dataSource: TypeOrmDataSource,
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignal)
    private readonly signalRepository: Repository<BacktestSignal>,
    @InjectRepository(BacktestOrder)
    private readonly orderRepository: Repository<BacktestOrder>,
    @InjectRepository(BacktestTrade)
    private readonly tradeRepository: Repository<BacktestTrade>,
    @InjectRepository(BacktestEquityPoint)
    private readonly equityPointRepository: Repository<BacktestEquityPoint>,
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    @InjectRepository(KExtensionQmt)
    private readonly qmtExtensionRepository: Repository<KExtensionQmt>,
    private readonly engine: StrategyBacktestEngine,
  ) {}

  onModuleInit(): void {
    this.scheduleProcessNext();
    this.pollTimer = setInterval(() => {
      this.scheduleProcessNext();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private scheduleProcessNext(): void {
    void this.processScheduledRun();
  }

  private async processScheduledRun(): Promise<void> {
    try {
      await this.processNext();
    } catch (error) {
      this.logger.error(
        'Strategy backtest processor cycle failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async processNext(): Promise<boolean> {
    if (this.processing) return false;

    this.processing = true;
    try {
      const run = await this.claimNextRun();
      if (!run) return false;

      await this.processClaimedRun(run);
      return true;
    } finally {
      this.processing = false;
    }
  }

  private async claimNextRun(): Promise<BacktestRun | null> {
    return await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BacktestRun);
      const now = new Date();
      const run = await repository
        .createQueryBuilder('run')
        .setLock('pessimistic_write')
        .where(
          '(run.status = :pending OR (run.status = :running AND run.lease_expires_at < :now))',
          {
            pending: BacktestRunStatus.PENDING,
            running: BacktestRunStatus.RUNNING,
            now,
          },
        )
        .orderBy('run.created_at', 'ASC')
        .getOne();
      if (!run) return null;

      if (run.status === BacktestRunStatus.RUNNING) {
        if (run.cancelRequestedAt) {
          run.status = BacktestRunStatus.CANCELLED;
          run.stage = BacktestRunStage.FINALIZING;
          run.completedAt = now;
          run.leaseOwner = null;
          run.leaseHeartbeatAt = null;
          run.leaseExpiresAt = null;
          await repository.save(run);
          return null;
        }
        await this.clearRunFactsInTransaction(manager, run.id);
        this.resetRunOutput(run);
      }

      run.status = BacktestRunStatus.RUNNING;
      run.stage = BacktestRunStage.LOADING_DATA;
      run.attemptCount += 1;
      run.startedAt ??= now;
      run.leaseOwner = this.leaseOwner;
      run.leaseHeartbeatAt = now;
      run.leaseExpiresAt = this.leaseExpiry(now);
      run.cancelRequestedAt = null;
      return await repository.save(run);
    });
  }

  private async processClaimedRun(run: BacktestRun): Promise<void> {
    try {
      await this.assertNotCancelled(run);
      await this.recordHeartbeat(run, BacktestRunStage.LOADING_DATA, 0, 0);
      // Decode both snapshots exactly once for the whole run; every downstream
      // step reuses these typed values instead of re-reading and re-coercing.
      const config = this.readConfigSnapshot(run);
      const strategy = this.readStrategySnapshot(run);
      const marketData = await this.loadMarketData(run, config, strategy);
      await this.assertNotCancelled(run);
      await this.establishOrVerifyMarketDataFingerprint(run, marketData);
      await this.recordHeartbeat(run, BacktestRunStage.SIMULATING, 0, 0);

      const output = await this.engine.runInBatches(
        this.toEngineInput(run, marketData, config, strategy),
        ENGINE_DATE_BATCH_SIZE,
        async ({ processedWork, totalWork }) => {
          await this.assertNotCancelled(run);
          await this.recordHeartbeat(
            run,
            BacktestRunStage.SIMULATING,
            processedWork,
            totalWork,
          );
          await this.yieldToEventLoop();
        },
      );
      await this.assertNotCancelled(run);
      await this.recordHeartbeat(
        run,
        BacktestRunStage.FINALIZING,
        run.totalWork,
        run.totalWork,
      );
      await this.persistFacts(run, output);
      await this.assertNotCancelled(run);
      await this.recordHeartbeat(
        run,
        BacktestRunStage.FINALIZING,
        run.totalWork,
        run.totalWork,
      );
      await this.completeRun(run, output);
    } catch (error) {
      if (error instanceof BacktestCancelledError) {
        await this.cancelRun(run);
        return;
      }
      if (error instanceof BacktestLeaseLostError) return;
      await this.failRun(run, error);
    }
  }

  private async loadMarketData(
    run: BacktestRun,
    config: StrategyBacktestConfig,
    strategy: StrategySnapshot,
  ): Promise<MarketData> {
    if (run.period !== Period.DAY) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.PERIOD_UNSUPPORTED,
        {
          period: run.period,
        },
      );
    }
    if (!isStrategyBacktestSource(run.source)) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.PRICE_MODEL_UNSUPPORTED,
        { source: run.source },
      );
    }
    const expectedPriceModel = strategyBacktestPriceModel(run.source);
    if (
      run.configSnapshot.priceModel !== expectedPriceModel ||
      run.configSnapshot.marketDataFingerprintAlgorithm !==
        MARKET_DATA_FINGERPRINT_ALGORITHM
    ) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.CONFIG_SNAPSHOT_INVALID,
        {
          runId: run.id,
          expectedPriceModel,
          actualPriceModel: run.configSnapshot.priceModel ?? null,
          expectedFingerprintAlgorithm: MARKET_DATA_FINGERPRINT_ALGORITHM,
          actualFingerprintAlgorithm:
            run.configSnapshot.marketDataFingerprintAlgorithm ?? null,
        },
      );
    }

    const codes = [...new Set([...run.targetUniverse, config.benchmarkCode])];
    const inRangeRows = await this.loadInRangeRows(run, codes);
    const inRangeRowsByCode = new Map<string, K[]>();
    for (const row of inRangeRows) {
      const code = row.security.code;
      const codeRows = inRangeRowsByCode.get(code) ?? [];
      codeRows.push(row);
      inRangeRowsByCode.set(code, codeRows);
    }
    const warmupRowsByCode = await this.loadWarmupRows(
      run,
      strategy.lookbackBars,
    );
    const missingCodes = [
      ...run.targetUniverse.filter(
        (code) => (inRangeRowsByCode.get(code)?.length ?? 0) === 0,
      ),
      ...((inRangeRowsByCode.get(config.benchmarkCode)?.length ?? 0) > 0
        ? []
        : [config.benchmarkCode]),
    ];
    if (missingCodes.length > 0) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.DATA_COVERAGE_MISSING,
        {
          missingCodes: [...new Set(missingCodes)].sort(),
        },
      );
    }

    const unsupportedStockCodes = run.targetUniverse
      .flatMap((code) => inRangeRowsByCode.get(code) ?? [])
      .filter((row) => row.security.type !== SecurityType.STOCK)
      .map((row) => row.security.code);
    if (unsupportedStockCodes.length > 0) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.SECURITY_TYPE_UNSUPPORTED,
        {
          codes: [...new Set(unsupportedStockCodes)].sort(),
        },
      );
    }

    const benchmarkRow = inRangeRowsByCode.get(config.benchmarkCode)?.[0];
    if (benchmarkRow?.security.type !== SecurityType.INDEX) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.BENCHMARK_TYPE_UNSUPPORTED,
        {
          code: config.benchmarkCode,
          type: benchmarkRow ? String(benchmarkRow.security.type) : null,
        },
      );
    }

    const requiredTimestamp = Math.min(
      ...run.targetUniverse.flatMap((code) =>
        (inRangeRowsByCode.get(code) ?? []).map((row) =>
          row.timestamp.getTime(),
        ),
      ),
    );
    const benchmarkRows = inRangeRowsByCode.get(config.benchmarkCode) ?? [];
    if (
      !benchmarkRows.some(
        (row) => row.timestamp.getTime() === requiredTimestamp,
      )
    ) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.BENCHMARK_ALIGNMENT_MISSING,
        {
          benchmarkCode: config.benchmarkCode,
          requiredTimestamp: new Date(requiredTimestamp).toISOString(),
          firstAvailableTimestamp:
            benchmarkRows[0]?.timestamp.toISOString() ?? null,
        },
      );
    }

    const selectedRows: SelectedMarketRow[] = [
      ...run.targetUniverse.flatMap((code) =>
        [
          ...(warmupRowsByCode.get(code) ?? []),
          ...(inRangeRowsByCode.get(code) ?? []),
        ].map((row) => ({ role: 'target' as const, row })),
      ),
      ...(inRangeRowsByCode.get(config.benchmarkCode) ?? []).map((row) => ({
        role: 'benchmark' as const,
        row,
      })),
    ];
    await this.assertSelectedPriceModel(run, selectedRows);

    return {
      bars: selectedRows
        .filter((selected) => selected.role === 'target')
        .map((selected) => this.toEngineBar(selected.row)),
      benchmarkBars: selectedRows
        .filter((selected) => selected.role === 'benchmark')
        .map((selected) => this.toEngineBar(selected.row)),
    };
  }

  private async loadInRangeRows(
    run: BacktestRun,
    codes: string[],
  ): Promise<K[]> {
    const rows: K[] = [];
    let cursorTimestamp: Date | null = null;
    let cursorId = 0;

    while (true) {
      const builder = this.kRepository
        .createQueryBuilder('k')
        .innerJoinAndSelect('k.security', 'security')
        .where('security.code IN (:...codes)', { codes })
        .andWhere('k.period = :period', { period: run.period })
        .andWhere('k.source = :source', { source: run.source })
        .andWhere('k.timestamp >= :startDate', { startDate: run.startDate })
        .andWhere('k.timestamp <= :endDate', { endDate: run.endDate });
      if (cursorTimestamp) {
        builder.andWhere(
          '(k.timestamp > :cursorTimestamp OR (k.timestamp = :cursorTimestamp AND k.id > :cursorId))',
          { cursorTimestamp, cursorId },
        );
      }

      const batch = await builder
        .orderBy('k.timestamp', 'ASC')
        .addOrderBy('k.id', 'ASC')
        .take(K_LOAD_BATCH_SIZE)
        .getMany();
      rows.push(...batch);
      await this.marketDataCheckpoint(run);
      if (batch.length < K_LOAD_BATCH_SIZE) break;
      const lastRow = batch.at(-1);
      if (!lastRow) break;
      cursorTimestamp = lastRow.timestamp;
      cursorId = lastRow.id;
    }

    return rows;
  }

  private async loadWarmupRows(
    run: BacktestRun,
    lookbackBars: number,
  ): Promise<Map<string, K[]>> {
    const rowsByCode = new Map<string, K[]>();
    for (let index = 0; index < run.targetUniverse.length; index += 1) {
      const code = run.targetUniverse[index];
      const rows = await this.kRepository.find({
        where: {
          security: { code },
          period: run.period,
          source: run.source,
          timestamp: LessThan(run.startDate),
        },
        relations: ['security'],
        order: { timestamp: 'DESC', id: 'DESC' },
        take: lookbackBars + 1,
      });
      rowsByCode.set(code, [...rows].reverse());
      if (
        (index + 1) % WARMUP_HEARTBEAT_INTERVAL === 0 ||
        index + 1 === run.targetUniverse.length
      ) {
        await this.marketDataCheckpoint(run);
      }
    }
    return rowsByCode;
  }

  private async marketDataCheckpoint(run: BacktestRun): Promise<void> {
    await this.assertNotCancelled(run);
    await this.renewLease(run);
    await this.yieldToEventLoop();
  }

  private async assertSelectedPriceModel(
    run: BacktestRun,
    selectedRows: SelectedMarketRow[],
  ): Promise<void> {
    if (run.source !== MarketDataSource.QMT) return;

    const selectedIds = [...new Set(selectedRows.map(({ row }) => row.id))];
    // Batch the K-id lookup so a 50-security × 10-year universe (≈130k rows)
    // does not blow past MySQL's practical IN-list size or hold the lease
    // without a heartbeat. Each batch also renews the lease.
    const markerByKId = new Map<number, string | null>();
    for (
      let offset = 0;
      offset < selectedIds.length;
      offset += QMT_MARKER_BATCH_SIZE
    ) {
      const batchIds = selectedIds.slice(
        offset,
        offset + QMT_MARKER_BATCH_SIZE,
      );
      const extensions = await this.qmtExtensionRepository.find({
        select: { kId: true, effectiveDividendType: true },
        where: { kId: In(batchIds) },
      });
      for (const extension of extensions) {
        markerByKId.set(extension.kId, extension.effectiveDividendType);
      }
      await this.marketDataCheckpoint(run);
    }
    const invalidRows = selectedRows.filter(
      ({ row }) => markerByKId.get(row.id) !== QMT_FRONT_RATIO_DIVIDEND_TYPE,
    );
    if (invalidRows.length === 0) return;

    throw new BacktestProcessingError(
      STRATEGY_BACKTEST_ERROR_CODES.PRICE_MODEL_UNSUPPORTED,
      {
        source: run.source,
        expectedEffectiveDividendType: QMT_FRONT_RATIO_DIVIDEND_TYPE,
        invalidCount: invalidRows.length,
        affectedRows: invalidRows.slice(0, 100).map(({ role, row }) => ({
          role,
          kId: row.id,
          securityCode: row.security.code,
          timestamp: row.timestamp.toISOString(),
          effectiveDividendType: markerByKId.get(row.id) ?? null,
        })),
      },
    );
  }

  private async establishOrVerifyMarketDataFingerprint(
    run: BacktestRun,
    marketData: MarketData,
  ): Promise<void> {
    const actualFingerprint = await this.calculateMarketDataFingerprint(
      marketData,
      async () => await this.marketDataCheckpoint(run),
    );
    if (run.marketDataFingerprint) {
      if (run.marketDataFingerprint !== actualFingerprint) {
        throw new BacktestProcessingError(
          STRATEGY_BACKTEST_ERROR_CODES.MARKET_DATA_CHANGED,
          {
            algorithm: MARKET_DATA_FINGERPRINT_ALGORITHM,
            expectedFingerprint: run.marketDataFingerprint,
            actualFingerprint,
          },
        );
      }
      return;
    }

    await this.updateOwnedRun(run, {
      marketDataFingerprint: actualFingerprint,
    });
  }

  private async calculateMarketDataFingerprint(
    marketData: MarketData,
    onBatch?: () => Promise<void>,
  ): Promise<string> {
    const buildCanonicalRow = (
      role: SelectedMarketRow['role'],
      bar: StrategyBacktestBar,
    ): FingerprintCanonicalRow => ({
      amount: bar.amount,
      close: bar.close,
      high: bar.high,
      low: bar.low,
      open: bar.open,
      period: bar.period,
      role,
      securityCode: bar.securityCode,
      securityType: bar.securityType,
      source: bar.source,
      timestamp: bar.timestamp.toISOString(),
      volume: bar.volume,
    });
    const compareRows = (
      left: FingerprintCanonicalRow,
      right: FingerprintCanonicalRow,
    ) =>
      left.role.localeCompare(right.role) ||
      left.securityCode.localeCompare(right.securityCode) ||
      left.timestamp.localeCompare(right.timestamp);
    const targetRows = marketData.bars
      .map((bar) => buildCanonicalRow('target', bar))
      .sort(compareRows);
    const benchmarkRows = marketData.benchmarkBars
      .map((bar) => buildCanonicalRow('benchmark', bar))
      .sort(compareRows);
    const hash = createHash('sha256');
    hash.update('{"bars":[', 'utf8');
    let processed = 0;
    processed = await this.hashCanonicalRows(
      hash,
      targetRows,
      processed,
      onBatch,
    );
    hash.update('],"benchmarkBars":[', 'utf8');
    await this.hashCanonicalRows(hash, benchmarkRows, processed, onBatch);
    hash.update(']}', 'utf8');
    return hash.digest('hex');
  }

  private async hashCanonicalRows(
    hash: ReturnType<typeof createHash>,
    rows: FingerprintCanonicalRow[],
    processed: number,
    onBatch?: () => Promise<void>,
  ): Promise<number> {
    for (let index = 0; index < rows.length; index += 1) {
      if (index > 0) hash.update(',', 'utf8');
      const row = rows[index];
      hash.update(JSON.stringify(row), 'utf8');
      processed += 1;
      if (onBatch && processed % FINGERPRINT_YIELD_BATCH_SIZE === 0) {
        await onBatch();
      }
    }
    return processed;
  }

  private toEngineInput(
    run: BacktestRun,
    marketData: MarketData,
    config: StrategyBacktestConfig,
    strategy: StrategySnapshot,
  ): StrategyBacktestInput {
    return {
      strategyDefinitionId: run.strategyDefinitionId,
      strategyVersionId: run.strategyVersionId,
      entryRule: strategy.entryRule,
      exitRule: strategy.exitRule,
      lookbackBars: strategy.lookbackBars,
      startDate: run.startDate,
      endDate: run.endDate,
      bars: marketData.bars,
      benchmarkBars: marketData.benchmarkBars,
      config,
    };
  }

  private readStrategySnapshot(run: BacktestRun): StrategySnapshot {
    const snapshot = run.strategySnapshot;
    if (
      !this.isRecord(snapshot) ||
      !this.isRecord(snapshot.entryRule) ||
      !this.isRecord(snapshot.exitRule) ||
      snapshot.ruleSchemaVersion !== StrategyRuleSchemaVersion.V1 ||
      typeof snapshot.lookbackBars !== 'number' ||
      !Number.isInteger(snapshot.lookbackBars) ||
      snapshot.lookbackBars < 1 ||
      snapshot.lookbackBars > 250
    ) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.STRATEGY_SNAPSHOT_INVALID,
        {
          runId: run.id,
          expected: StrategyRuleSchemaVersion.V1,
          actual: this.isRecord(snapshot)
            ? (snapshot.ruleSchemaVersion ?? null)
            : null,
        },
      );
    }

    return {
      entryRule: snapshot.entryRule,
      exitRule: snapshot.exitRule,
      lookbackBars: snapshot.lookbackBars,
      ruleSchemaVersion: snapshot.ruleSchemaVersion,
    };
  }

  private readConfigSnapshot(run: BacktestRun): StrategyBacktestConfig {
    const snapshot = run.configSnapshot;
    if (!this.isRecord(snapshot)) {
      throw new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.CONFIG_SNAPSHOT_INVALID,
        { runId: run.id },
      );
    }

    const invalid = (field: string) =>
      new BacktestProcessingError(
        STRATEGY_BACKTEST_ERROR_CODES.CONFIG_SNAPSHOT_INVALID,
        { runId: run.id, field },
      );

    // The snapshot is written by createRun from a validated config, so values
    // are real numbers. Only accept typeof === 'number' (reject numeric
    // strings, null, booleans) and re-validate finite/integer/range so a
    // corrupted snapshot fails fast instead of feeding bad values to the engine.
    const decodeNumber = (
      key: keyof StrategyBacktestConfig,
      constraints: { min: number; max: number; integer?: boolean },
    ): number => {
      const raw = snapshot[key];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        throw invalid(key);
      }
      if (constraints.integer && !Number.isInteger(raw)) {
        throw invalid(key);
      }
      if (raw < constraints.min || raw > constraints.max) {
        throw invalid(key);
      }
      return raw;
    };

    const benchmarkRaw = snapshot.benchmarkCode;
    if (typeof benchmarkRaw !== 'string' || !/^\d{6}$/.test(benchmarkRaw)) {
      throw invalid('benchmarkCode');
    }

    return {
      initialCash: decodeNumber('initialCash', {
        min: 0.01,
        max: MAX_BACKTEST_CNY,
      }),
      maxPositions: decodeNumber('maxPositions', {
        min: 1,
        max: 50,
        integer: true,
      }),
      slippageBps: decodeNumber('slippageBps', { min: 0, max: 10_000 }),
      commissionRate: decodeNumber('commissionRate', { min: 0, max: 1 }),
      minCommission: decodeNumber('minCommission', {
        min: 0,
        max: MAX_BACKTEST_CNY,
      }),
      stampDutyRate: decodeNumber('stampDutyRate', { min: 0, max: 1 }),
      transferFeeRate: decodeNumber('transferFeeRate', { min: 0, max: 1 }),
      benchmarkCode: benchmarkRaw,
    };
  }

  private toEngineBar(row: K): StrategyBacktestBar {
    return {
      securityCode: row.security.code,
      securityType: String(row.security.type),
      source: row.source,
      period: row.period,
      timestamp: row.timestamp,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      amount: Number(row.amount),
    };
  }

  private async persistFacts(
    run: BacktestRun,
    output: StrategyBacktestOutput,
  ): Promise<void> {
    const signalRows = output.signals.map((signal) =>
      this.signalRepository.create({
        backtestRunId: run.id,
        strategyDefinitionId: run.strategyDefinitionId,
        strategyVersionId: run.strategyVersionId,
        securityCode: signal.securityCode,
        period: run.period,
        source: run.source,
        signalKind: signal.signalKind,
        signalTime: signal.signalTime,
        contextSnapshot: signal.contextSnapshot,
        ruleSnapshot: signal.ruleSnapshot,
      }),
    );
    const savedSignals = await this.saveInBatches(
      BacktestSignal,
      signalRows,
      run,
    );
    const signalIds = new Map(
      output.signals.map((signal, index) => [
        signal.signalIndex,
        savedSignals[index]?.id ?? null,
      ]),
    );

    const orderRows = output.orders.map((order) =>
      this.orderRepository.create({
        backtestRunId: run.id,
        backtestSignalId: signalIds.get(order.signalIndex) ?? null,
        securityCode: order.securityCode,
        side: order.side,
        status: order.status,
        reason: order.reason,
        scheduledTime: order.scheduledTime,
        executionTime: order.executionTime,
        expiredAt: order.expiredAt,
        quantity: order.quantity,
        fillPrice: order.fillPrice,
        grossAmount: order.grossAmount,
        commission: order.commission,
        stampDuty: order.stampDuty,
        transferFee: order.transferFee,
        totalFee: order.totalFee,
      }),
    );
    const savedOrders = await this.saveInBatches(BacktestOrder, orderRows, run);
    const orderIds = new Map(
      output.orders.map((order, index) => [
        order.orderIndex,
        savedOrders[index]?.id ?? null,
      ]),
    );

    const tradeRows = output.trades.map((trade) =>
      this.tradeRepository.create({
        backtestRunId: run.id,
        securityCode: trade.securityCode,
        status: trade.status,
        entryOrderId: orderIds.get(trade.entryOrderIndex) ?? 0,
        exitOrderId:
          trade.exitOrderIndex === null
            ? null
            : (orderIds.get(trade.exitOrderIndex) ?? null),
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        quantity: trade.quantity,
        entryFee: trade.entryFee,
        exitFee: trade.exitFee,
        realizedPnl: trade.realizedPnl,
        holdingDays: trade.holdingDays,
      }),
    );
    await this.saveInBatches(BacktestTrade, tradeRows, run);

    const equityRows = output.equityPoints.map((point) =>
      this.equityPointRepository.create({
        backtestRunId: run.id,
        pointTime: point.pointTime,
        cash: point.cash,
        marketValue: point.marketValue,
        equity: point.equity,
        benchmarkValue: point.benchmarkValue,
        drawdown: point.drawdown,
        exposure: point.exposure,
      }),
    );
    await this.saveInBatches(BacktestEquityPoint, equityRows, run);

    run.signalCount = output.signals.length;
    run.matchedSecurityCount = new Set(
      output.signals.map((signal) => signal.securityCode),
    ).size;
    run.metrics = output.metrics;
  }

  private async saveInBatches<T extends object>(
    target: EntityTarget<T>,
    rows: T[],
    run: BacktestRun,
  ): Promise<T[]> {
    const saved: T[] = [];
    for (let index = 0; index < rows.length; index += FACT_BATCH_SIZE) {
      await this.assertNotCancelled(run);
      const batch = rows.slice(index, index + FACT_BATCH_SIZE);
      const persisted = await this.dataSource.transaction(async (manager) => {
        const lockedRun = await this.lockOwnedRunForFactWrite(manager, run);
        const savedBatch = await manager.getRepository(target).save(batch);
        const now = new Date();
        const changes: Partial<BacktestRun> = {
          stage: BacktestRunStage.FINALIZING,
          processedWork: run.processedWork,
          totalWork: run.totalWork,
          progressPercent:
            run.totalWork === 0
              ? 0
              : Math.min(100, (run.processedWork / run.totalWork) * 100),
          leaseHeartbeatAt: now,
          leaseExpiresAt: this.leaseExpiry(now),
        };
        Object.assign(lockedRun, changes);
        await manager.getRepository(BacktestRun).save(lockedRun);
        Object.assign(run, changes);
        return savedBatch;
      });
      saved.push(...persisted);
      await this.yieldToEventLoop();
    }
    return saved;
  }

  private async assertNotCancelled(run: BacktestRun): Promise<void> {
    const latest = await this.runRepository.findOne({ where: { id: run.id } });
    if (
      latest?.status === BacktestRunStatus.CANCELLED ||
      latest?.cancelRequestedAt
    ) {
      throw new BacktestCancelledError();
    }
    if (
      latest &&
      (latest.status !== BacktestRunStatus.RUNNING ||
        latest.leaseOwner !== run.leaseOwner)
    ) {
      throw new BacktestLeaseLostError();
    }
    if (
      latest &&
      (!latest.leaseExpiresAt || latest.leaseExpiresAt <= new Date())
    ) {
      throw new BacktestLeaseLostError();
    }
  }

  private async recordHeartbeat(
    run: BacktestRun,
    stage: BacktestRunStage,
    processedWork: number,
    totalWork: number,
  ): Promise<void> {
    const now = new Date();
    await this.updateOwnedRun(run, {
      stage,
      processedWork,
      totalWork,
      progressPercent:
        totalWork === 0 ? 0 : Math.min(100, (processedWork / totalWork) * 100),
      leaseHeartbeatAt: now,
      leaseExpiresAt: this.leaseExpiry(now),
    });
  }

  /**
   * Renew the lease without changing stage or progress. Used to keep a long
   * data-loading / fingerprint step (which has no natural batch boundary) from
   * silently letting the lease expire.
   */
  private async renewLease(run: BacktestRun): Promise<void> {
    const now = new Date();
    await this.updateOwnedRun(run, {
      leaseHeartbeatAt: now,
      leaseExpiresAt: this.leaseExpiry(now),
    });
  }

  private async completeRun(
    run: BacktestRun,
    output: StrategyBacktestOutput,
  ): Promise<void> {
    await this.updateOwnedRun(run, {
      stage: BacktestRunStage.FINALIZING,
      processedWork: run.totalWork,
      progressPercent: 100,
      status: BacktestRunStatus.COMPLETED,
      completedAt: new Date(),
      signalCount: run.signalCount,
      matchedSecurityCount: run.matchedSecurityCount,
      metrics: output.metrics,
      leaseOwner: null,
      leaseHeartbeatAt: null,
      leaseExpiresAt: null,
    });
  }

  private async cancelRun(run: BacktestRun): Promise<void> {
    try {
      await this.updateOwnedRun(run, {
        stage: BacktestRunStage.FINALIZING,
        status: BacktestRunStatus.CANCELLED,
        completedAt: new Date(),
        leaseOwner: null,
        leaseHeartbeatAt: null,
        leaseExpiresAt: null,
      });
    } catch (error) {
      if (error instanceof BacktestLeaseLostError) return;
      throw error;
    }
  }

  private async failRun(run: BacktestRun, error: unknown): Promise<void> {
    const processingError =
      error instanceof BacktestProcessingError ? error : undefined;
    try {
      await this.updateOwnedRun(run, {
        status: BacktestRunStatus.FAILED,
        signalCount: 0,
        matchedSecurityCount: 0,
        metrics: null,
        completedAt: new Date(),
        errorCode:
          processingError?.code ??
          STRATEGY_BACKTEST_ERROR_CODES.PROCESSING_FAILED,
        errorDetails: processingError?.details ?? {
          message:
            error instanceof Error ? error.message : 'Unknown backtest error',
        },
        errorMessage:
          error instanceof Error ? error.message : 'Backtest processing failed',
        leaseOwner: null,
        leaseHeartbeatAt: null,
        leaseExpiresAt: null,
      });
    } catch (updateError) {
      if (updateError instanceof BacktestLeaseLostError) return;
      throw updateError;
    }
  }

  private async updateOwnedRun(
    run: BacktestRun,
    changes: Partial<BacktestRun>,
  ): Promise<void> {
    if (!run.leaseOwner) throw new BacktestLeaseLostError();
    const result = await this.runRepository.update(
      {
        id: run.id,
        status: BacktestRunStatus.RUNNING,
        leaseOwner: run.leaseOwner,
        leaseExpiresAt: MoreThan(new Date()),
      },
      changes as any,
    );
    if (result.affected !== 1) throw new BacktestLeaseLostError();
    Object.assign(run, changes);
  }

  private async lockOwnedRunForFactWrite(
    manager: EntityManager,
    run: BacktestRun,
  ): Promise<BacktestRun> {
    const lockedRun = await manager.getRepository(BacktestRun).findOne({
      where: { id: run.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!lockedRun) throw new BacktestLeaseLostError();
    if (
      lockedRun.status === BacktestRunStatus.CANCELLED ||
      lockedRun.cancelRequestedAt
    ) {
      throw new BacktestCancelledError();
    }
    if (
      lockedRun.status !== BacktestRunStatus.RUNNING ||
      lockedRun.leaseOwner !== run.leaseOwner ||
      !lockedRun.leaseExpiresAt ||
      lockedRun.leaseExpiresAt <= new Date()
    ) {
      throw new BacktestLeaseLostError();
    }
    return lockedRun;
  }

  private async clearRunFactsInTransaction(
    manager: EntityManager,
    runId: number,
  ): Promise<void> {
    await manager.delete(BacktestOrder, { backtestRunId: runId });
    await manager.delete(BacktestTrade, { backtestRunId: runId });
    await manager.delete(BacktestEquityPoint, { backtestRunId: runId });
    await manager.delete(BacktestSignal, { backtestRunId: runId });
  }

  private resetRunOutput(run: BacktestRun): void {
    run.signalCount = 0;
    run.matchedSecurityCount = 0;
    run.processedWork = 0;
    run.totalWork = 0;
    run.progressPercent = 0;
    run.metrics = null;
    run.errorCode = null;
    run.errorDetails = null;
    run.errorMessage = null;
    run.completedAt = null;
  }

  private leaseExpiry(now: Date): Date {
    return new Date(now.getTime() + LEASE_DURATION_MS);
  }

  private async yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
