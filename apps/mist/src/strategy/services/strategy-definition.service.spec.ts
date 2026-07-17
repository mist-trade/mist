import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      findOne: jest.fn(async ({ where }) => {
        return versions.find((version) => version.id === where.id);
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
    entryRule: {
      field: 'k.close',
      operator: 'gt',
      value: 100,
    },
    exitRule: {
      field: 'k.close',
      operator: 'lt',
      value: 90,
    },
    lookbackBars: 1,
    backtestEnabled: false,
  };

  const pairedCreateDto = {
    name: 'MACD histogram portfolio strategy',
    description: 'Enter on strength and exit on weakness',
    targetUniverse: ['600519', '000001'],
    periods: [Period.DAY],
    sources: [DataSource.TDX],
    entryRule: {
      field: 'k.close',
      operator: 'gt',
      value: 100,
    },
    exitRule: {
      field: 'k.close',
      operator: 'lt',
      value: 90,
    },
    lookbackBars: 1,
    backtestEnabled: false,
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
      entryRule: createDto.entryRule,
      exitRule: createDto.exitRule,
      lookbackBars: createDto.lookbackBars,
    });
  });

  it('updates paired rules by creating a new immutable version', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create(createDto);

    const updated = await service.update(strategy.id, {
      description: 'Updated description',
      entryRule: { field: 'k.close', operator: 'gt', value: 120 },
      exitRule: { field: 'k.close', operator: 'lt', value: 90 },
      lookbackBars: 2,
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

  it('creates a paired V1 version with backtesting disabled by default', async () => {
    const { service, versions } = createHarness();

    const strategy = await service.create(pairedCreateDto as any);

    expect(strategy).toMatchObject({
      id: 1,
      backtestEnabled: false,
      currentVersionId: 1,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      strategyDefinitionId: 1,
      entryRule: pairedCreateDto.entryRule,
      exitRule: pairedCreateDto.exitRule,
      lookbackBars: 1,
    });
  });

  it('creates a new immutable version when paired rule behavior changes', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create(pairedCreateDto as any);

    const updated = await service.update(strategy.id, {
      entryRule: {
        field: 'k.close',
        operator: 'gt',
        value: 120,
      },
      exitRule: pairedCreateDto.exitRule,
      lookbackBars: 2,
    } as any);

    expect(updated.currentVersionId).toBe(2);
    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({
      versionNumber: 2,
      lookbackBars: 2,
    });
  });

  it('rejects backtest enablement when the current version has no exit rule', async () => {
    const { service } = createHarness();
    const strategy = await service.create({
      ...pairedCreateDto,
      exitRule: undefined,
    } as any);

    await expect(
      service.update(strategy.id, { backtestEnabled: true } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a version whose lookback cannot resolve its indicator fields', async () => {
    const { service } = createHarness();

    await expect(
      service.create({
        ...pairedCreateDto,
        entryRule: {
          field: 'indicator.ma60',
          operator: 'gt',
          value: 10,
        },
        lookbackBars: 1,
      } as any),
    ).rejects.toThrow('lookbackBars must be at least 59');
  });

  it('requires daily bars and at least one source only when backtesting is enabled', async () => {
    const { service } = createHarness();
    const strategy = await service.create({
      ...pairedCreateDto,
      periods: [Period.ONE_MIN],
      sources: [],
    } as any);

    await expect(
      service.update(strategy.id, { backtestEnabled: true } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects backtest enablement when EF is the only configured source', async () => {
    const { service } = createHarness();
    const strategy = await service.create({
      ...pairedCreateDto,
      sources: [DataSource.EAST_MONEY],
    } as any);

    await expect(
      service.update(strategy.id, { backtestEnabled: true } as any),
    ).rejects.toThrow('Backtesting requires a configured tdx or qmt source');
  });

  it('keeps backtest eligibility independent from the live strategy status', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create(pairedCreateDto as any);

    await service.disable(strategy.id);
    const updated = await service.update(strategy.id, {
      backtestEnabled: true,
    } as any);

    expect(updated).toMatchObject({
      status: StrategyStatus.DISABLED,
      backtestEnabled: true,
      currentVersionId: 1,
    });
    expect(versions).toHaveLength(1);
  });

  it('allows metadata-only updates for an already eligible backtest definition', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create({
      ...pairedCreateDto,
      backtestEnabled: true,
    } as any);

    await expect(
      service.update(strategy.id, { description: 'Metadata only' } as any),
    ).resolves.toMatchObject({
      description: 'Metadata only',
      backtestEnabled: true,
      currentVersionId: 1,
    });

    expect(versions).toHaveLength(1);
  });

  it('does not persist an invalid replacement version when backtest eligibility rejects it', async () => {
    const { service, versions } = createHarness();
    const strategy = await service.create({
      ...pairedCreateDto,
      backtestEnabled: true,
    } as any);

    await expect(
      service.update(strategy.id, {
        entryRule: { field: 'k.close', operator: 'gt', value: 120 },
        exitRule: null,
        lookbackBars: 1,
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(versions).toHaveLength(1);
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
