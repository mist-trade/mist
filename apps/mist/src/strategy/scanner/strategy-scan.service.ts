import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  K,
  StrategyAlertEvent,
  StrategyAlertStatus,
  StrategyDefinition,
  StrategySignal,
  StrategySignalKind,
  StrategySignalSource,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import {
  DataSource,
  FindOptionsWhere,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { RunStrategyScanDto } from '../dto/run-strategy-scan.dto';
import { StrategyRuleEvaluator } from '../rules/strategy-rule-evaluator';
import { StrategyEvaluationContextBuilder } from './strategy-evaluation-context.builder';
import { StrategyScanResult } from './strategy-scan.types';

@Injectable()
export class StrategyScanService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    @InjectRepository(K)
    private readonly kRepository: Repository<K>,
    private readonly contextBuilder: StrategyEvaluationContextBuilder,
    private readonly ruleEvaluator: StrategyRuleEvaluator,
  ) {}

  async runScan(dto: RunStrategyScanDto): Promise<StrategyScanResult> {
    const result: StrategyScanResult = {
      scannedStrategies: 0,
      evaluatedContexts: 0,
      createdSignals: 0,
      createdAlertEvents: 0,
      skippedDuplicates: 0,
    };
    const definitions = await this.findEnabledDefinitions(dto);

    result.scannedStrategies = definitions.length;

    for (const definition of definitions) {
      const version = await this.loadCurrentVersion(definition);
      if (!version) continue;

      const periods = dto.period ? [dto.period] : definition.periods;
      const sources = dto.source ? [dto.source] : definition.sources;

      for (const securityCode of definition.targetUniverse) {
        for (const period of periods) {
          for (const source of sources) {
            const k = await this.loadLatestK(securityCode, period, source);
            if (!k) continue;

            result.evaluatedContexts += 1;
            const lookbackBars = version.lookbackBars ?? 1;
            const history = await this.loadCompletedHistory(k, lookbackBars);
            const context = this.contextBuilder.buildFromK(
              k,
              history,
              lookbackBars,
            );
            const previousK = history
              .filter((row) => row.timestamp < k.timestamp)
              .sort(
                (left, right) =>
                  right.timestamp.getTime() - left.timestamp.getTime(),
              )[0];
            const previousContext = previousK
              ? this.contextBuilder.buildFromK(previousK, history, lookbackBars)
              : undefined;
            const contextSnapshot = context as unknown as Record<
              string,
              unknown
            >;
            const previousContextSnapshot = previousContext as
              | Record<string, unknown>
              | undefined;

            const matchedRules = [
              {
                signalKind: StrategySignalKind.EXIT,
                rule: version.exitRule,
              },
              {
                signalKind: StrategySignalKind.ENTRY,
                rule: version.entryRule,
              },
            ].filter(
              (
                candidate,
              ): candidate is {
                signalKind: StrategySignalKind;
                rule: Record<string, unknown>;
              } => candidate.rule !== null && candidate.rule !== undefined,
            );

            for (const { signalKind, rule } of matchedRules) {
              const evaluation = this.ruleEvaluator.evaluate(
                rule,
                contextSnapshot,
                previousContextSnapshot,
              );
              if (!evaluation.matched) continue;

              const didCreate = await this.persistSignalAndAlert(
                definition,
                version,
                k,
                signalKind,
                contextSnapshot,
                rule,
              );
              if (didCreate) {
                result.createdSignals += 1;
                result.createdAlertEvents += 1;
              } else {
                result.skippedDuplicates += 1;
              }
            }
          }
        }
      }
    }

    return result;
  }

  private async persistSignalAndAlert(
    definition: StrategyDefinition,
    version: StrategyVersion,
    k: K,
    signalKind: StrategySignalKind,
    context: Record<string, unknown>,
    rule: Record<string, unknown>,
  ): Promise<boolean> {
    const dedupeKey = this.buildDedupeKey(
      definition,
      version,
      k.security.code,
      k.period,
      k.source,
      k.timestamp,
      signalKind,
    );
    try {
      return await this.dataSource.transaction(async (manager) => {
        const alertEventRepository = manager.getRepository(StrategyAlertEvent);
        const signalRepository = manager.getRepository(StrategySignal);
        const duplicate = await alertEventRepository.findOne({
          where: { dedupeKey },
        });
        if (duplicate) return false;

        const signal = await signalRepository.save(
          signalRepository.create({
            strategyDefinitionId: definition.id,
            strategyVersionId: version.id,
            securityCode: k.security.code,
            period: k.period,
            source: k.source,
            signalTime: k.timestamp,
            signalSource: StrategySignalSource.LIVE,
            signalKind,
            contextSnapshot: context,
            ruleSnapshot: rule,
          }),
        );

        await alertEventRepository.save(
          alertEventRepository.create({
            strategySignalId: signal.id,
            status: StrategyAlertStatus.PENDING,
            dedupeKey,
          }),
        );

        return true;
      });
    } catch (error) {
      if (this.isDuplicateAlertDedupeError(error)) return false;
      throw error;
    }
  }

  private isDuplicateAlertDedupeError(error: unknown): boolean {
    const record = this.asRecord(error);
    const driverError = this.asRecord(record?.driverError) ?? record;
    const code = driverError?.code;
    const constraint = driverError?.constraint;
    const message = driverError?.message;
    return (
      code === 'ER_DUP_ENTRY' &&
      (constraint === 'uq_strategy_alert_events_dedupe_key' ||
        (typeof message === 'string' &&
          message.includes('uq_strategy_alert_events_dedupe_key')))
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private async findEnabledDefinitions(
    dto: RunStrategyScanDto,
  ): Promise<StrategyDefinition[]> {
    const where: FindOptionsWhere<StrategyDefinition> = {
      status: StrategyStatus.ENABLED,
    };

    if (dto.strategyDefinitionId !== undefined) {
      where.id = dto.strategyDefinitionId;
    }

    return await this.definitionRepository.find({
      where,
      order: { id: 'ASC' },
    });
  }

  private async loadCurrentVersion(
    definition: StrategyDefinition,
  ): Promise<StrategyVersion | null> {
    if (!definition.currentVersionId) return null;
    return await this.versionRepository.findOne({
      where: { id: definition.currentVersionId },
    });
  }

  private async loadLatestK(
    securityCode: string,
    period: K['period'],
    source: K['source'],
  ): Promise<K | null> {
    return await this.kRepository.findOne({
      where: {
        security: { code: securityCode },
        period,
        source,
      },
      relations: ['security'],
      order: { timestamp: 'DESC' },
    });
  }

  private async loadCompletedHistory(
    current: K,
    lookbackBars: number,
  ): Promise<K[]> {
    return await this.kRepository.find({
      where: {
        security: { code: current.security.code },
        period: current.period,
        source: current.source,
        timestamp: LessThanOrEqual(current.timestamp),
      },
      relations: ['security'],
      order: { timestamp: 'DESC' },
      take: lookbackBars + 2,
    });
  }

  private buildDedupeKey(
    definition: StrategyDefinition,
    version: StrategyVersion,
    securityCode: string,
    period: K['period'],
    source: K['source'],
    signalTime: Date,
    signalKind: StrategySignalKind,
  ): string {
    return [
      definition.id,
      version.id,
      securityCode,
      period,
      source,
      signalTime.toISOString(),
      signalKind,
    ].join(':');
  }
}
