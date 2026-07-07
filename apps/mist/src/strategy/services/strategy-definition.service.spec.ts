import { NotFoundException } from '@nestjs/common';
import { DataSource, Period, StrategyStatus } from '@app/shared-data';
import { StrategyRuleValidator } from '../rules/strategy-rule-validator';
import { StrategyDefinitionService } from './strategy-definition.service';

describe('StrategyDefinitionService', () => {
  const createHarness = () => {
    let nextDefinitionId = 1;
    let nextVersionId = 1;
    const definitions: any[] = [];
    const versions: any[] = [];
    const definitionRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (entity) => {
        if (!entity.id) {
          entity.id = nextDefinitionId++;
          definitions.push(entity);
        }
        return entity;
      }),
      find: jest.fn(async () => definitions),
      findOne: jest.fn(async ({ where }) => {
        return definitions.find((definition) => definition.id === where.id);
      }),
    };
    const versionRepository = {
      create: jest.fn((input) => ({ ...input })),
      save: jest.fn(async (entity) => {
        entity.id = nextVersionId++;
        versions.push(entity);
        return entity;
      }),
      count: jest.fn(async ({ where }) => {
        return versions.filter(
          (version) =>
            version.strategyDefinitionId === where.strategyDefinitionId,
        ).length;
      }),
      find: jest.fn(async ({ where }) => {
        return versions.filter(
          (version) =>
            version.strategyDefinitionId === where.strategyDefinitionId,
        );
      }),
    };
    const service = new StrategyDefinitionService(
      definitionRepository as any,
      versionRepository as any,
      new StrategyRuleValidator(),
    );

    return { service, definitions, versions };
  };

  const createDto = {
    name: 'MACD histogram breakout',
    description: 'Track MACD histogram crosses above zero',
    targetUniverse: ['600519', '000001'],
    periods: [Period.DAY],
    sources: [DataSource.TDX],
    rule: {
      all: [
        {
          field: 'indicator.macd.histogram',
          operator: 'crossesAbove',
          value: 0,
        },
      ],
    },
  };

  it('creates a draft strategy definition with initial version 1', async () => {
    const { service, versions } = createHarness();

    const strategy = await service.create(createDto);

    expect(strategy).toMatchObject({
      id: 1,
      name: createDto.name,
      status: StrategyStatus.DRAFT,
      currentVersionId: 1,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      id: 1,
      strategyDefinitionId: 1,
      versionNumber: 1,
      rule: createDto.rule,
    });
  });

  it('updates rules by creating a new immutable version', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create(createDto);

    const updated = await service.update(strategy.id, {
      description: 'Updated description',
      rule: {
        all: [{ field: 'k.close', operator: 'gt', value: 100 }],
      },
    });

    expect(updated).toMatchObject({
      id: strategy.id,
      description: 'Updated description',
      currentVersionId: 2,
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({
      strategyDefinitionId: strategy.id,
      versionNumber: 2,
    });
  });

  it('enables and disables a strategy without changing versions', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create(createDto);

    await expect(service.enable(strategy.id)).resolves.toMatchObject({
      status: StrategyStatus.ENABLED,
      currentVersionId: 1,
    });
    await expect(service.disable(strategy.id)).resolves.toMatchObject({
      status: StrategyStatus.DISABLED,
      currentVersionId: 1,
    });
    expect(versions).toHaveLength(1);
  });

  it('throws when the strategy definition does not exist', async () => {
    const { service } = createHarness();

    await expect(service.findById(404)).rejects.toThrow(NotFoundException);
  });
});
