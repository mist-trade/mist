import {
  BacktestEquityPoint,
  BacktestOrder,
  BacktestRun,
  BacktestRunStage,
  BacktestRunStatus,
  BacktestSignal,
  BacktestTrade,
  K,
  Period,
  SecurityType,
} from '@app/shared-data';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  In,
  LessThanOrEqual,
  MoreThan,
  Repository,
} from 'typeorm';
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

type StrategySnapshot = {
  entryRule: Record<string, unknown>;
  exitRule: Record<string, unknown> | null;
  lookbackBars: number;
};

type MarketData = {
  bars: StrategyBacktestBar[];
  benchmarkBars: StrategyBacktestBar[];
};

class BacktestProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown>,
  ) {
    super(code);
  }
}

class BacktestCancelledError extends Error {}

class BacktestLeaseLostError extends Error {
  constructor() {
    super('BACKTEST_LEASE_LOST');
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
    private readonly dataSource: DataSource,
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
      await this.heartbeat(run, BacktestRunStage.LOADING_DATA, 0, 0);
      const marketData = await this.loadMarketData(run);
      await this.assertNotCancelled(run);
      await this.heartbeat(run, BacktestRunStage.SIMULATING, 0, 0);

      const output = await this.engine.runInBatches(
        this.toEngineInput(run, marketData),
        ENGINE_DATE_BATCH_SIZE,
        async ({ processedWork, totalWork }) => {
          await this.assertNotCancelled(run);
          await this.heartbeat(
            run,
            BacktestRunStage.SIMULATING,
            processedWork,
            totalWork,
          );
          await this.yieldToEventLoop();
        },
      );
      await this.assertNotCancelled(run);
      await this.heartbeat(
        run,
        BacktestRunStage.FINALIZING,
        run.totalWork,
        run.totalWork,
      );
      await this.persistFacts(run, output);
      await this.assertNotCancelled(run);
      await this.heartbeat(
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

  private async loadMarketData(run: BacktestRun): Promise<MarketData> {
    const config = this.readConfigSnapshot(run);
    const strategy = this.readStrategySnapshot(run);
    if (run.period !== Period.DAY) {
      throw new BacktestProcessingError('BACKTEST_PERIOD_UNSUPPORTED', {
        period: run.period,
      });
    }

    const codes = [...new Set([...run.targetUniverse, config.benchmarkCode])];
    const rows = await this.kRepository.find({
      where: {
        security: { code: In(codes) },
        period: run.period,
        source: run.source,
        timestamp: LessThanOrEqual(run.endDate),
      },
      relations: ['security'],
      order: { timestamp: 'ASC' },
    });
    const inRangeRows = rows.filter(
      (row) => row.timestamp >= run.startDate && row.timestamp <= run.endDate,
    );
    const missingCodes = [
      ...run.targetUniverse.filter(
        (code) => !inRangeRows.some((row) => row.security.code === code),
      ),
      ...(inRangeRows.some((row) => row.security.code === config.benchmarkCode)
        ? []
        : [config.benchmarkCode]),
    ];
    if (missingCodes.length > 0) {
      throw new BacktestProcessingError('BACKTEST_DATA_COVERAGE_MISSING', {
        missingCodes: [...new Set(missingCodes)].sort(),
      });
    }

    const unsupportedStockCodes = rows
      .filter((row) => run.targetUniverse.includes(row.security.code))
      .filter((row) => row.security.type !== SecurityType.STOCK)
      .map((row) => row.security.code);
    if (unsupportedStockCodes.length > 0) {
      throw new BacktestProcessingError('BACKTEST_SECURITY_TYPE_UNSUPPORTED', {
        codes: [...new Set(unsupportedStockCodes)].sort(),
      });
    }

    const benchmarkRow = rows.find(
      (row) => row.security.code === config.benchmarkCode,
    );
    if (benchmarkRow?.security.type !== SecurityType.INDEX) {
      throw new BacktestProcessingError('BACKTEST_BENCHMARK_TYPE_UNSUPPORTED', {
        code: config.benchmarkCode,
        type: benchmarkRow ? String(benchmarkRow.security.type) : null,
      });
    }

    return {
      bars: run.targetUniverse.flatMap((code) =>
        this.selectReplayRows(
          rows.filter((row) => row.security.code === code),
          run,
          strategy.lookbackBars,
        ).map((row) => this.toEngineBar(row)),
      ),
      benchmarkBars: rows
        .filter((row) => row.security.code === config.benchmarkCode)
        .filter(
          (row) =>
            row.timestamp >= run.startDate && row.timestamp <= run.endDate,
        )
        .map((row) => this.toEngineBar(row)),
    };
  }

  private selectReplayRows(
    rows: K[],
    run: BacktestRun,
    lookbackBars: number,
  ): K[] {
    const warmupRows = rows
      .filter((row) => row.timestamp < run.startDate)
      .slice(-(lookbackBars + 1));
    const replayRows = rows.filter(
      (row) => row.timestamp >= run.startDate && row.timestamp <= run.endDate,
    );
    return [...warmupRows, ...replayRows];
  }

  private toEngineInput(
    run: BacktestRun,
    marketData: MarketData,
  ): StrategyBacktestInput {
    const strategy = this.readStrategySnapshot(run);
    const config = this.readConfigSnapshot(run);

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
      (snapshot.exitRule !== null && !this.isRecord(snapshot.exitRule)) ||
      !Number.isInteger(snapshot.lookbackBars)
    ) {
      throw new BacktestProcessingError('BACKTEST_STRATEGY_SNAPSHOT_INVALID', {
        runId: run.id,
      });
    }

    return {
      entryRule: snapshot.entryRule,
      exitRule: snapshot.exitRule ?? null,
      lookbackBars: snapshot.lookbackBars as number,
    };
  }

  private readConfigSnapshot(run: BacktestRun): StrategyBacktestConfig {
    const snapshot = run.configSnapshot;
    const keys: (keyof StrategyBacktestConfig)[] = [
      'initialCash',
      'maxPositions',
      'slippageBps',
      'commissionRate',
      'minCommission',
      'stampDutyRate',
      'transferFeeRate',
      'benchmarkCode',
    ];
    if (
      !this.isRecord(snapshot) ||
      keys.some((key) => snapshot[key] === undefined)
    ) {
      throw new BacktestProcessingError('BACKTEST_CONFIG_SNAPSHOT_INVALID', {
        runId: run.id,
      });
    }

    return {
      initialCash: Number(snapshot.initialCash),
      maxPositions: Number(snapshot.maxPositions),
      slippageBps: Number(snapshot.slippageBps),
      commissionRate: Number(snapshot.commissionRate),
      minCommission: Number(snapshot.minCommission),
      stampDutyRate: Number(snapshot.stampDutyRate),
      transferFeeRate: Number(snapshot.transferFeeRate),
      benchmarkCode: String(snapshot.benchmarkCode),
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

  private async heartbeat(
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
        errorCode: processingError?.code ?? 'BACKTEST_PROCESSING_FAILED',
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
