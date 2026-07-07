import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  StrategyDefinition,
  StrategyRuleSchemaVersion,
  StrategyStatus,
  StrategyVersion,
} from '@app/shared-data';
import { Repository } from 'typeorm';
import { CreateStrategyDefinitionDto } from '../dto/create-strategy-definition.dto';
import { UpdateStrategyDefinitionDto } from '../dto/update-strategy-definition.dto';
import { StrategyRuleValidator } from '../rules/strategy-rule-validator';

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
    const validationSummary = this.ruleValidator.validate(dto.rule);
    const definition = await this.definitionRepository.save(
      this.definitionRepository.create({
        name: dto.name,
        description: dto.description ?? null,
        status: StrategyStatus.DRAFT,
        targetUniverse: dto.targetUniverse,
        periods: dto.periods,
        sources: dto.sources,
      }),
    );

    const version = await this.versionRepository.save(
      this.versionRepository.create({
        strategyDefinition: definition,
        strategyDefinitionId: definition.id,
        versionNumber: 1,
        ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
        rule: dto.rule,
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

    if (dto.rule !== undefined) {
      const validationSummary = this.ruleValidator.validate(dto.rule);
      const existingVersionCount = await this.versionRepository.count({
        where: { strategyDefinitionId: definition.id },
      });
      const version = await this.versionRepository.save(
        this.versionRepository.create({
          strategyDefinition: definition,
          strategyDefinitionId: definition.id,
          versionNumber: existingVersionCount + 1,
          ruleSchemaVersion: StrategyRuleSchemaVersion.V1,
          rule: dto.rule,
          validationSummary,
        }),
      );
      definition.currentVersionId = version.id;
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
}
