import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  DataSource,
  Period,
  Security,
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategySignalKind,
  StrategySignalSource,
  StrategyVersion,
  type BacktestTargetIssue,
} from '@app/shared-data';
import {
  compileStoredDefinitionVersion,
  HistoricalBarSource,
  mapKernelSignalToPersistencePayload,
  StrategyEvaluationKernel,
  type CompiledStoredDefinition,
  type StrategyRealtimeSource,
} from '@app/strategy';
import { DataSource as TypeOrmDataSource, In, Repository } from 'typeorm';
import { BacktestMarketDataAdapter } from './backtest-market-data.adapter';
import { BacktestRunFailure } from './backtest-run-error';
import { HealthStateService } from './health/health-state.service';

const BACKTEST_CALCULATION_BATCH_SIZE = 100;
const BACKTEST_RESULT_BATCH_SIZE = 100;

class ReplayBudget {
  consumed = 0;
  private lastYieldConsumed = -1;

  constructor(
    private readonly maxBars: number,
    private readonly deadlineAt: number,
  ) {}

  consume(): void {
    if (Date.now() >= this.deadlineAt) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_TIMEOUT');
    }
    this.consumed += 1;
    if (this.consumed > this.maxBars) {
      throw new BacktestRunFailure('BACKTEST_BAR_LIMIT_EXCEEDED');
    }
  }

  checkDeadline(): void {
    if (Date.now() >= this.deadlineAt) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_TIMEOUT');
    }
  }

  async checkpoint(forceYield = false): Promise<void> {
    this.checkDeadline();
    const shouldYield =
      forceYield || this.consumed % BACKTEST_CALCULATION_BATCH_SIZE === 0;
    if (!shouldYield || this.lastYieldConsumed === this.consumed) return;
    this.lastYieldConsumed = this.consumed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.checkDeadline();
  }
}

@Injectable()
export class BacktestRunExecutor {
  private readonly logger = new Logger(BacktestRunExecutor.name);

  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignalResult)
    private readonly resultRepository: Repository<BacktestSignalResult>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    private readonly marketData: BacktestMarketDataAdapter,
    private readonly dataSource: TypeOrmDataSource,
    private readonly config: ConfigService,
    private readonly health: HealthStateService,
  ) {}

  async execute(runId: number): Promise<void> {
    let claimed: BacktestRun | null;
    try {
      claimed = await this.claim(runId);
    } catch (error) {
      this.health.recordRunFailed('BACKTEST_DATABASE_ERROR', 0);
      await this.failAndCleanup(runId, classifyFailure(error));
      this.logger.error(
        `Backtest run ${runId} could not be claimed`,
        errorTrace(error),
      );
      return;
    }
    if (!claimed) return;

    const startedAt = Date.now();
    try {
      await this.replay(claimed);
      const durationMs = Date.now() - startedAt;
      this.health.recordRunCompleted(durationMs);
      this.logger.log(
        `backtest run completed runId=${runId} durationMs=${durationMs}`,
      );
    } catch (error) {
      const failure = classifyFailure(error);
      this.health.recordRunFailed(failure.code, Date.now() - startedAt);
      await this.failAndCleanup(runId, failure);
      this.logger.error(
        `Backtest run ${runId} failed reason=${failure.code}`,
        errorTrace(error),
      );
    }
  }

  private async claim(runId: number): Promise<BacktestRun | null> {
    const result = await this.runRepository.update(
      { id: runId, status: BacktestRunStatus.PENDING },
      { status: BacktestRunStatus.RUNNING, startedAt: new Date() },
    );
    if (result.affected !== 1) return null;
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) throw new Error(`claimed backtest run ${runId} disappeared`);
    return run;
  }

  private async replay(run: BacktestRun): Promise<void> {
    if (run.source !== DataSource.TDX && run.source !== DataSource.QMT) {
      throw new BacktestRunFailure('BACKTEST_SOURCE_UNSUPPORTED');
    }
    if (!Array.isArray(run.targetUniverse) || run.targetUniverse.length === 0) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }

    const version = await this.versionRepository.findOne({
      where: { id: run.strategyVersionId },
    });
    if (!version) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
    if (version.ruleSchemaVersion !== StrategyRuleSchemaVersion.V1) {
      throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');
    }
    const definition = await this.definitionRepository.findOne({
      where: { id: run.strategyDefinitionId },
    });
    if (!definition) throw new BacktestRunFailure('BACKTEST_EXECUTION_FAILED');

    // 编译边界统一收口：run.kind 仅作 DB 快照语义，回放一律透明编译为
    // decision_flow 统一计划（kernel 相位由 publicFrom 时间轴判定）。
    const compiled: CompiledStoredDefinition = compileStoredDefinitionVersion({
      kind: run.kind,
      rule: version.rule as Record<string, unknown>,
      signalKind: version.signalKind,
    });
    this.logger.log(
      `backtest plan compiled runId=${run.id} sourceKind=${compiled.sourceKind} requiredBarCount=${compiled.requiredBarCount}`,
    );

    const timeoutMs =
      this.config.get<number>('BACKTEST_RUN_TIMEOUT_MS') ?? 1_800_000;
    const maxBars =
      this.config.get<number>('BACKTEST_MAX_BARS_PER_RUN') ?? 10_000_000;
    const budget = new ReplayBudget(maxBars, Date.now() + timeoutMs);

    if (run.targetUniverse.some((code) => typeof code !== 'string')) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }
    const normalizedTargets = [
      ...new Set(run.targetUniverse.map(normalizeCode)),
    ];
    if (
      normalizedTargets.length === 0 ||
      normalizedTargets.some((code) => code.length === 0)
    ) {
      throw new BacktestRunFailure('BACKTEST_TARGET_UNIVERSE_EMPTY');
    }
    const securities = await this.securityRepository.find({
      where: { code: In(normalizedTargets) },
    });
    const byCode = new Map(
      securities.map((security) => [security.code, security]),
    );
    const issues: BacktestTargetIssue[] = [];
    const executable: Array<{ code: string; security: Security }> = [];
    const seenSecurityIds = new Set<number>();
    for (const code of normalizedTargets) {
      if (!byCode.has(code)) {
        issues.push({ securityCode: code, code: 'SECURITY_NOT_FOUND' });
        this.health.recordTargetIssue('SECURITY_NOT_FOUND');
        this.logger.warn(
          `backtest target_issue code=SECURITY_NOT_FOUND securityCode=${code}`,
        );
        continue;
      }
      const security = byCode.get(code);
      if (!security || seenSecurityIds.has(security.id)) continue;
      seenSecurityIds.add(security.id);
      executable.push({ code, security });
    }
    if (executable.length === 0) {
      throw new BacktestRunFailure(
        'BACKTEST_NO_EXECUTABLE_TARGETS',
        'BACKTEST_NO_EXECUTABLE_TARGETS',
        undefined,
        uniqueIssues(issues),
      );
    }

    const results: BacktestSignalResult[] = [];
    let signalCount = 0;
    const matchedCodes = new Set<string>();
    const prewarmActuals: number[] = [];
    for (const { code, security } of executable) {
      const outcome = await this.replaySecurity(
        run,
        compiled,
        compiled.ruleSnapshot,
        code,
        security.id,
        results,
        matchedCodes,
        budget,
        () => {
          signalCount += 1;
        },
      );
      if (outcome.hasBars) {
        prewarmActuals.push(outcome.prewarmActual);
      }
      if (!outcome.hasBars) {
        issues.push({ securityCode: code, code: 'NO_HISTORICAL_BARS' });
        this.health.recordTargetIssue('NO_HISTORICAL_BARS');
        this.logger.warn(
          `backtest target_issue code=NO_HISTORICAL_BARS securityCode=${code}`,
        );
      }
    }
    await this.flushResults(results);

    const prewarmMinActual =
      prewarmActuals.length > 0 ? Math.min(...prewarmActuals) : null;
    const prewarmMinExpected = compiled.requiredBarCount;
    const prewarmStatus =
      prewarmMinActual === null
        ? null
        : prewarmMinActual >= prewarmMinExpected
          ? 'full'
          : prewarmMinActual > 0
            ? 'partial'
            : 'empty';

    const completed = await this.runRepository.update(
      { id: run.id, status: BacktestRunStatus.RUNNING },
      {
        status: BacktestRunStatus.COMPLETED,
        targetIssues: uniqueIssues(issues),
        signalCount,
        matchedSecurityCount: matchedCodes.size,
        prewarmStatus,
        prewarmMinActual,
        prewarmMinExpected,
        completedAt: new Date(),
        errorMessage: null,
      },
    );
    if (completed.affected !== 1) {
      throw new BacktestRunFailure('BACKTEST_DATABASE_ERROR');
    }
  }

  private async replaySecurity(
    run: BacktestRun,
    compiled: CompiledStoredDefinition,
    ruleSnapshot: Readonly<Record<string, unknown>>,
    securityCode: string,
    securityId: number,
    results: BacktestSignalResult[],
    matchedCodes: Set<string>,
    budget: ReplayBudget,
    onSignal: () => void,
  ): Promise<{
    hasBars: boolean;
    prewarmStatus: 'full' | 'partial' | 'empty';
    prewarmActual: number;
  }> {
    const preWarmEndAt = replayStartFor(run);
    const kernel = new StrategyEvaluationKernel({
      securityId,
      securityCode,
      period: run.period,
      publicFrom: run.startDate,
      plans: [
        {
          definitionId: run.strategyDefinitionId,
          versionId: run.strategyVersionId,
          flow: compiled.flow,
          ruleSnapshot,
          requiredBarCount: compiled.requiredBarCount,
        },
      ],
    });
    const source = new HistoricalBarSource(this.marketData, {
      securityId,
      source: run.source as StrategyRealtimeSource,
      period: run.period,
      preWarmEndAt,
      publicFrom: run.startDate,
      endAt: new Date(run.endDate.getTime()),
      requiredBars: compiled.requiredBarCount,
    });
    const outcome = await source.drive(
      kernel,
      async (signal) => {
        budget.consume();
        const payload = mapKernelSignalToPersistencePayload(signal, {
          securityId,
          securityCode,
          source: run.source,
          period: run.period,
          ruleSnapshot,
        });
        results.push(
          this.resultRepository.create({
            backtestRunId: run.id,
            securityId: payload.securityId,
            strategyDefinitionId: payload.definitionId,
            strategyVersionId: payload.versionId,
            securityCode: payload.securityCode ?? securityCode,
            period: payload.period as Period,
            source: payload.source as DataSource,
            signalTime: payload.signalTime,
            pivotTime: payload.pivotTime,
            signalType: payload.signalType,
            signalKind: payload.signalKind as StrategySignalKind,
            signalSource: StrategySignalSource.BACKTEST,
            confidence: payload.confidence,
            confidenceLevel: payload.confidenceLevel,
            decisionTrace: payload.decisionTrace,
            contextSnapshot: payload.contextSnapshot,
            ruleSnapshot: payload.ruleSnapshot,
          }),
        );
        matchedCodes.add(securityCode);
        onSignal();
        if (results.length >= BACKTEST_RESULT_BATCH_SIZE)
          await this.flushResults(results);
      },
      async () => {
        budget.consume();
        await budget.checkpoint();
      },
    );
    await budget.checkpoint(true);
    return {
      hasBars: outcome.publicBarCount > 0,
      prewarmStatus: outcome.prewarmStatus,
      prewarmActual: outcome.prewarmActual,
    };
  }

  private async flushResults(results: BacktestSignalResult[]): Promise<void> {
    if (results.length === 0) return;
    const pending = results.splice(0, results.length);
    const startedAt = Date.now();
    // TypeORM's JSON DeepPartial type rejects Record<string, unknown> even
    // though it is the entity's declared JSON boundary; keep this cast local
    // to the batch writer rather than weakening the entity contract.
    try {
      await this.resultRepository.insert(
        pending.map((result) => ({
          backtestRunId: result.backtestRunId,
          securityId: result.securityId,
          strategyDefinitionId: result.strategyDefinitionId,
          strategyVersionId: result.strategyVersionId,
          securityCode: result.securityCode,
          period: result.period,
          source: result.source,
          signalTime: result.signalTime,
          pivotTime: result.pivotTime,
          signalType: result.signalType,
          signalKind: result.signalKind,
          signalSource: result.signalSource,
          confidence: result.confidence,
          confidenceLevel: result.confidenceLevel,
          decisionTrace: result.decisionTrace,
          contextSnapshot: result.contextSnapshot,
          ruleSnapshot: result.ruleSnapshot,
        })) as never,
      );
      this.health.recordResultBatch(pending.length, Date.now() - startedAt);
    } catch (error) {
      this.health.recordResultBatchFailure(Date.now() - startedAt);
      this.logger.error(
        `backtest persistence_batch_failed runId=${pending[0]?.backtestRunId}`,
      );
      throw error;
    }
  }

  private async failAndCleanup(
    runId: number,
    failure: BacktestRunFailure,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const update = {
          status: BacktestRunStatus.FAILED,
          completedAt: new Date(),
          errorMessage: failure.code,
          ...(failure.targetIssues
            ? { targetIssues: uniqueIssues(failure.targetIssues) }
            : {}),
        };
        const updated = await manager.update(
          BacktestRun,
          {
            id: runId,
            status: In([BacktestRunStatus.PENDING, BacktestRunStatus.RUNNING]),
          },
          update,
        );
        if (updated.affected !== 1) return;
        await manager.delete(BacktestSignalResult, { backtestRunId: runId });
      });
    } catch (error) {
      this.logger.error(
        `Backtest cleanup failed for ${runId}`,
        errorTrace(error),
      );
    }
  }
}

function normalizeCode(value: string): string {
  return value.trim();
}

function uniqueIssues(
  issues: readonly BacktestTargetIssue[],
): BacktestTargetIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.securityCode}\u0000${issue.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replayStartFor(run: BacktestRun): Date {
  return new Date(run.startDate.getTime());
}

function classifyFailure(error: unknown): BacktestRunFailure {
  if (error instanceof BacktestRunFailure) return error;
  return new BacktestRunFailure(
    'BACKTEST_DATABASE_ERROR',
    'BACKTEST_DATABASE_ERROR',
    error,
  );
}

function errorTrace(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
