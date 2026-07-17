import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyDefinition,
  Period,
  StrategyRuleSchemaVersion,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import { Repository } from 'typeorm';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { UpdateStrategyDefinitionDto } from '../dto/update-strategy-definition.dto';
import { StrategyRuleValidator } from '../rules/strategy-rule-validator';
import { isStrategyBacktestSource } from '../backtest/strategy-backtest.constants';

@Injectable()
export class StrategyDefinitionService {
  constructor(
    @InjectRepository(StrategyDefinition)
    private readonly definitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyVersion)
    private readonly versionRepository: Repository<StrategyVersion>,
    private readonly ruleValidator: StrategyRuleValidator,
  ) {}

  async create(dto: CreateStrategyDefinitionDto): Promise<StrategyDefinition> {
    const exitRule = dto.exitRule ?? null;
    const backtestEnabled = dto.backtestEnabled ?? false;
    const validationSummary = this.validateVersionRules(
      dto.entryRule,
      exitRule,
      dto.lookbackBars,
    );
    this.assertBacktestEligibility(
      dto.periods,
      dto.sources,
      dto.entryRule,
      exitRule,
      dto.lookbackBars,
      backtestEnabled,
    );
    const definition = await this.definitionRepository.save(
      this.definitionRepository.create({
        name: dto.name,
        description: dto.description ?? null,
        status: StrategyStatus.DRAFT,
        targetUniverse: dto.targetUniverse,
        periods: dto.periods,
        sources: dto.sources,
        backtestEnabled,
      }),
    );

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        strategyDefinition: definition,
        strategyDefinitionId: definition.id,
        versionNumber: 1,
        ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
        entryRule: dto.entryRule,
        exitRule,
        lookbackBars: dto.lookbackBars,
        validationSummary,
      }),
    );

    definition.currentVersionId = version.id;
    return await this.definitionRepository.save(definition);
  }

  async update(
    id: number,
    dto: UpdateStrategyDefinitionDto,
  ): Promise<StrategyDefinition> {
    const definition = await this.findById(id);

    if (dto.name !== undefined) definition.name = dto.name;
    if (dto.description !== undefined) definition.description = dto.description;
    if (dto.targetUniverse !== undefined) {
      definition.targetUniverse = dto.targetUniverse;
    }
    if (dto.periods !== undefined) definition.periods = dto.periods;
    if (dto.sources !== undefined) definition.sources = dto.sources;

    const changesVersion =
      dto.entryRule !== undefined ||
      dto.exitRule !== undefined ||
      dto.lookbackBars !== undefined;
    const backtestEnabled = dto.backtestEnabled ?? definition.backtestEnabled;
    const needsCurrentVersion = changesVersion || backtestEnabled;
    const currentVersion = needsCurrentVersion
      ? await this.findCurrentVersion(definition)
      : undefined;
    let candidateEntryRule = currentVersion?.entryRule;
    let candidateExitRule = currentVersion?.exitRule ?? null;
    let candidateLookbackBars = currentVersion?.lookbackBars;

    let validationSummary: Record<string, unknown> | undefined;
    if (changesVersion) {
      candidateEntryRule = dto.entryRule ?? currentVersion?.entryRule;
      candidateExitRule =
        dto.exitRule !== undefined
          ? dto.exitRule
          : (currentVersion?.exitRule ?? null);
      candidateLookbackBars = dto.lookbackBars ?? currentVersion?.lookbackBars;
      validationSummary = this.validateVersionRules(
        candidateEntryRule,
        candidateExitRule,
        candidateLookbackBars,
      );
    }

    if (backtestEnabled) {
      if (!changesVersion) {
        this.validateVersionRules(
          candidateEntryRule,
          candidateExitRule,
          candidateLookbackBars,
        );
      }
      this.assertBacktestEligibility(
        definition.periods,
        definition.sources,
        candidateEntryRule,
        candidateExitRule,
        candidateLookbackBars,
        true,
      );
    }

    if (changesVersion) {
      const existingVersionCount = await this.versionRepository.count({
        where: { strategyDefinitionId: definition.id },
      });
      const version = await this.versionRepository.save(
        this.versionRepository.create({
          strategyDefinition: definition,
          strategyDefinitionId: definition.id,
          versionNumber: existingVersionCount + 1,
          ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
          entryRule: candidateEntryRule,
          exitRule: candidateExitRule,
          lookbackBars: candidateLookbackBars,
          validationSummary: validationSummary!,
        }),
      );
      definition.currentVersionId = version.id;
    }

    if (dto.backtestEnabled !== undefined) {
      definition.backtestEnabled = dto.backtestEnabled;
    }

    return await this.definitionRepository.save(definition);
  }

  async findAll(): Promise<StrategyDefinition[]> {
    return await this.definitionRepository.find({
      order: { id: 'DESC' },
    });
  }

  async findById(id: number): Promise<StrategyDefinition> {
    const definition = await this.definitionRepository.findOne({
      where: { id },
    });

    if (!definition) {
      throw new NotFoundException(`Strategy definition ${id} not found`);
    }

    return definition;
  }

  async enable(id: number): Promise<StrategyDefinition> {
    const definition = await this.findById(id);
    definition.status = StrategyStatus.ENABLED;
    return await this.definitionRepository.save(definition);
  }

  async disable(id: number): Promise<StrategyDefinition> {
    const definition = await this.findById(id);
    definition.status = StrategyStatus.DISABLED;
    return await this.definitionRepository.save(definition);
  }

  async listVersions(strategyDefinitionId: number): Promise<StrategyVersion[]> {
    await this.findById(strategyDefinitionId);
    return await this.versionRepository.find({
      where: { strategyDefinitionId },
      order: { versionNumber: 'DESC' },
    });
  }

  private async findCurrentVersion(
    definition: StrategyDefinition,
  ): Promise<StrategyVersion> {
    if (!definition.currentVersionId) {
      throw new BadRequestException(
        `Strategy definition ${definition.id} has no current version`,
      );
    }

    const version = await this.versionRepository.findOne({
      where: { id: definition.currentVersionId },
    });

    if (!version) {
      throw new BadRequestException(
        `Strategy version ${definition.currentVersionId} not found`,
      );
    }

    return version;
  }

  private validateVersionRules(
    entryRule: Record<string, unknown> | undefined,
    exitRule: Record<string, unknown> | null,
    lookbackBars: number | undefined,
  ): Record<string, unknown> {
    if (!entryRule) {
      throw new BadRequestException('Strategy entry rule is required');
    }
    if (
      typeof lookbackBars !== 'number' ||
      !Number.isInteger(lookbackBars) ||
      lookbackBars < 1 ||
      lookbackBars > 250
    ) {
      throw new BadRequestException(
        'lookbackBars must be an integer from 1 to 250',
      );
    }

    const entrySummary = this.ruleValidator.validate(entryRule);
    const exitSummary = exitRule ? this.ruleValidator.validate(exitRule) : null;
    const requiredLookbackBars = Math.max(
      entrySummary.requiredLookbackBars,
      exitSummary?.requiredLookbackBars ?? 0,
    );
    if (lookbackBars < requiredLookbackBars) {
      throw new BadRequestException(
        `lookbackBars must be at least ${requiredLookbackBars} for the selected rule fields`,
      );
    }

    return {
      entryRule: entrySummary,
      exitRule: exitSummary,
      lookbackBars,
      requiredLookbackBars,
    };
  }

  private assertBacktestEligibility(
    periods: StrategyDefinition['periods'],
    sources: StrategyDefinition['sources'],
    entryRule: Record<string, unknown> | undefined,
    exitRule: Record<string, unknown> | null,
    lookbackBars: number | undefined,
    backtestEnabled: boolean,
  ): void {
    if (!backtestEnabled) return;

    if (!exitRule) {
      throw new BadRequestException(
        'Backtesting requires the current version to define an exit rule',
      );
    }
    if (!periods.includes(Period.DAY)) {
      throw new BadRequestException('Backtesting requires the daily period');
    }
    if (!sources.some(isStrategyBacktestSource)) {
      throw new BadRequestException(
        'Backtesting requires a configured tdx or qmt source',
      );
    }
  }
}
