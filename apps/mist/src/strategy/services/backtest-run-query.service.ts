import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BacktestRun,
  BacktestRunStatus,
  BacktestSignalResult,
  BacktestTradeResult,
} from '@app/shared-data';
import { isRecord } from '@app/utils';
import { HttpBusinessRejection } from '@app/transport/http';

import { Repository } from 'typeorm';
import { BacktestSignalResultQueryDto } from '../dto/backtest-signal-result-query.dto';
import { BacktestTradeResultQueryDto } from '../dto/backtest-trade-result-query.dto';
import { ListBacktestRunsQueryDto } from '../dto/list-backtest-runs-query.dto';

import {
  decodeBacktestResultCursor,
  encodeBacktestResultCursor,
  type BacktestResultCursor,
} from './backtest-result-cursor';
import { BacktestRunVo } from '../vo/backtest-run.vo';
import { BacktestSignalResultPageVo } from '../vo/backtest-signal-result-page.vo';
import { BacktestSignalResultVo } from '../vo/backtest-signal-result.vo';
import { SAFE_FAILURE_CODES_SET } from '@app/contracts';
import { DEFAULT_API_PAGE_LIMIT } from '@app/constants';
import { BacktestTradeResultPageVo } from '../vo/backtest-trade-result-page.vo';
import { BacktestTradeResultVo } from '../vo/backtest-trade-result.vo';
import { BacktestSuiteReportVo } from '../vo/backtest-suite-report.vo';

type QueryRejection = HttpBusinessRejection<
  string,
  { runId?: number; suiteId?: string; status?: BacktestRunStatus }
>;

const DEFAULT_TRADE_QUERY_LIMIT = DEFAULT_API_PAGE_LIMIT;

@Injectable()
export class BacktestRunQueryService {
  constructor(
    @InjectRepository(BacktestRun)
    private readonly runRepository: Repository<BacktestRun>,
    @InjectRepository(BacktestSignalResult)
    private readonly resultRepository: Repository<BacktestSignalResult>,
    @InjectRepository(BacktestTradeResult)
    private readonly tradeRepository: Repository<BacktestTradeResult>,
  ) {}

  async findRun(runId: number): Promise<BacktestRunVo | QueryRejection> {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) return notFound(runId);
    return mapRun(run);
  }

  async findSuite(
    suiteId: string,
  ): Promise<BacktestSuiteReportVo | QueryRejection> {
    const runs = await this.runRepository.find({
      where: { suiteId },
      order: { id: 'ASC' },
    });
    if (runs.length === 0) {
      return new HttpBusinessRejection(
        'BACKTEST_SUITE_NOT_FOUND',
        'Backtest suite was not found',
        { suiteId },
      );
    }

    const masterRun = runs.find((r) => !r.parentRunId) ?? runs[0];
    const childRuns = runs.filter((r) => r.id !== masterRun.id);

    const type = (masterRun.scenarioId === 'WFA' ? 'WFA' : 'STRESS_SUITE') as
      | 'WFA'
      | 'STRESS_SUITE';
    const contextSnapshot = masterRun.contextSnapshot as any;

    return {
      suiteId,
      type,
      masterRun: mapRun(masterRun),
      childRuns: childRuns.map(mapRun),
      wfaReport: contextSnapshot?.wfaReport ?? null,
      stressReport: contextSnapshot?.stressReport ?? null,
    };
  }

  async listRuns(query?: ListBacktestRunsQueryDto): Promise<BacktestRunVo[]> {
    const limit = Math.min(Math.max(query?.limit ?? 50, 1), 100);
    const builder = this.runRepository
      .createQueryBuilder('run')
      .orderBy('run.id', 'DESC')
      .take(limit);

    if (query?.strategyDefinitionId) {
      builder.where('run.strategyDefinitionId = :strategyDefinitionId', {
        strategyDefinitionId: query.strategyDefinitionId,
      });
    }

    const runs = await builder.getMany();
    return runs.map(mapRun);
  }

  async listSignals(
    runId: number,
    query: BacktestSignalResultQueryDto,
  ): Promise<BacktestSignalResultPageVo | QueryRejection> {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) return notFound(runId);
    if (
      run.status === BacktestRunStatus.PENDING ||
      run.status === BacktestRunStatus.RUNNING
    ) {
      return new HttpBusinessRejection(
        'BACKTEST_RESULTS_NOT_READY',
        'Backtest results are not ready',
        { runId, status: run.status },
      );
    }
    if (run.status === BacktestRunStatus.FAILED) {
      return new HttpBusinessRejection(
        'BACKTEST_RESULTS_UNAVAILABLE',
        'Backtest results are unavailable',
        { runId, status: run.status },
      );
    }

    let cursor: BacktestResultCursor | undefined;
    if (query.cursor) {
      try {
        cursor = decodeBacktestResultCursor(query.cursor, runId);
      } catch {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          errors: { cursor: ['must be a valid backtest result cursor'] },
        });
      }
    }
    const limit = query.limit ?? 50;
    const builder = this.resultRepository
      .createQueryBuilder('result')
      .select([
        'result.id',
        'result.backtestRunId',
        'result.securityCode',
        'result.signalTime',
        'result.pivotTime',
        'result.signalType',
        'result.confidence',
        'result.confidenceLevel',
        'result.decisionTrace',
        'result.contextSnapshot',
        'result.ruleSnapshot',
        'result.createdAt',
      ])
      .where('result.backtestRunId = :runId', { runId })
      .orderBy('result.signalTime', 'ASC')
      .addOrderBy('result.id', 'ASC')
      .take(limit + 1);
    if (cursor) {
      builder.andWhere(
        '(result.signalTime > :signalTime OR (result.signalTime = :signalTime AND result.id > :id))',
        { signalTime: cursor.signalTime, id: cursor.id },
      );
    }
    const rows = await builder.getMany();
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;
    const items = pageRows.map(mapResult);
    const last = pageRows.at(-1);
    return {
      items,
      nextCursor:
        hasNext && last
          ? encodeBacktestResultCursor({
              runId,
              signalTime: last.signalTime,
              id: last.id,
            })
          : null,
    };
  }

  async listTrades(
    runId: number,
    query: BacktestTradeResultQueryDto,
  ): Promise<BacktestTradeResultPageVo | QueryRejection> {
    const run = await this.runRepository.findOne({ where: { id: runId } });
    if (!run) return notFound(runId);
    if (
      run.status === BacktestRunStatus.PENDING ||
      run.status === BacktestRunStatus.RUNNING
    ) {
      return new HttpBusinessRejection(
        'BACKTEST_RESULTS_NOT_READY',
        'Backtest results are not ready',
        { runId, status: run.status },
      );
    }
    if (run.status === BacktestRunStatus.FAILED) {
      return new HttpBusinessRejection(
        'BACKTEST_RESULTS_UNAVAILABLE',
        'Backtest results are unavailable',
        { runId, status: run.status },
      );
    }

    const limit = query.limit ?? DEFAULT_TRADE_QUERY_LIMIT;
    const offset = query.offset ?? 0;
    const where: { backtestRunId: number; securityCode?: string } = {
      backtestRunId: runId,
    };
    if (query.securityCode) {
      where.securityCode = query.securityCode;
    }

    const [rows, total] = await this.tradeRepository.findAndCount({
      where,
      order: { entryTime: 'ASC', id: 'ASC' },
      take: limit,
      skip: offset,
    });

    return {
      items: rows.map(mapTrade),
      total,
      limit,
      offset,
    };
  }
}

function notFound(runId: number): QueryRejection {
  return new HttpBusinessRejection(
    'BACKTEST_RUN_NOT_FOUND',
    'Backtest run was not found',
    { runId },
  );
}

function mapRun(run: BacktestRun): BacktestRunVo {
  return {
    id: run.id,
    strategyDefinitionId: run.strategyDefinitionId,
    strategyVersionId: run.strategyVersionId,
    targetUniverse: [...run.targetUniverse],
    period: run.period,
    source: run.source,
    startDate: run.startDate.toISOString(),
    endDate: run.endDate.toISOString(),
    status: run.status,
    signalCount: run.signalCount,
    matchedSecurityCount: run.matchedSecurityCount,
    targetIssues: mapTargetIssues(run.targetIssues),
    startedAt: toIsoOrNull(run.startedAt),
    completedAt: toIsoOrNull(run.completedAt),
    errorMessage: safeErrorMessage(run.errorMessage),
    totalReturn: toNumberOrNull(run.totalReturn),
    annualizedReturn: toNumberOrNull(run.annualizedReturn),
    maxDrawdown: toNumberOrNull(run.maxDrawdown),
    sharpeRatio: toNumberOrNull(run.sharpeRatio),
    calmarRatio: toNumberOrNull(run.calmarRatio),
    winRate: toNumberOrNull(run.winRate),
    profitLossRatio: toNumberOrNull(run.profitLossRatio),
    tradeCount: run.tradeCount ?? null,
    navSeries: run.navSeries ?? null,
    benchmarkCode: run.benchmarkCode ?? null,
    parentRunId: run.parentRunId ?? null,
    suiteId: run.suiteId ?? null,
    stage: run.stage ?? null,
    scenarioId: run.scenarioId ?? null,
    contextSnapshot: run.contextSnapshot ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function mapResult(result: BacktestSignalResult): BacktestSignalResultVo {
  return {
    id: result.id,
    backtestRunId: result.backtestRunId,
    securityCode: result.securityCode,
    signalTime: result.signalTime.toISOString(),
    pivotTime: result.pivotTime ? result.pivotTime.toISOString() : null,
    signalType: result.signalType,
    confidence:
      result.confidence !== null && result.confidence !== undefined
        ? Number(result.confidence)
        : null,
    confidenceLevel: result.confidenceLevel ?? null,
    decisionTrace: result.decisionTrace ?? null,
    contextSnapshot: result.contextSnapshot,
    ruleSnapshot: result.ruleSnapshot,
    createdAt: (result.createdAt ?? new Date()).toISOString(),
  };
}

function toIsoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function safeErrorMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  return SAFE_FAILURE_CODES_SET.has(value)
    ? value
    : 'BACKTEST_EXECUTION_FAILED';
}

const TARGET_ISSUE_CODES = new Set([
  'SECURITY_NOT_FOUND',
  'NO_HISTORICAL_BARS',
]);
const SECURITY_CODE_PATTERN = /^[A-Za-z0-9._-]{1,20}$/;

function mapTargetIssues(value: unknown): BacktestRunVo['targetIssues'] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const issues: BacktestRunVo['targetIssues'] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const securityCode = candidate.securityCode;
    const code = candidate.code;
    if (
      typeof securityCode !== 'string' ||
      !SECURITY_CODE_PATTERN.test(securityCode) ||
      typeof code !== 'string' ||
      !TARGET_ISSUE_CODES.has(code)
    ) {
      continue;
    }
    const key = `${securityCode}\u0000${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      securityCode,
      code: code as 'SECURITY_NOT_FOUND' | 'NO_HISTORICAL_BARS',
    });
  }
  return issues;
}

function mapTrade(trade: BacktestTradeResult): BacktestTradeResultVo {
  return {
    id: trade.id,
    backtestRunId: trade.backtestRunId,
    securityId: trade.securityId ?? null,
    securityCode: trade.securityCode,
    entryTime: trade.entryTime.toISOString(),
    exitTime: trade.exitTime.toISOString(),
    holdingBars: trade.holdingBars,
    entryPrice: Number(trade.entryPrice),
    exitPrice: Number(trade.exitPrice),
    quantity: trade.quantity,
    realizedPnl: Number(trade.realizedPnl),
    returnRatio: Number(trade.returnRatio),
    exitReason: trade.exitReason,
    createdAt: (trade.createdAt ?? new Date()).toISOString(),
  };
}

function toNumberOrNull(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
