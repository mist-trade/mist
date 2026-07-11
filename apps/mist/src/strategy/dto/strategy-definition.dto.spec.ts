import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Period } from '@app/shared-data';
import { CreateStrategyDefinitionDto } from './create-strategy-definition.dto';
import { UpdateStrategyDefinitionDto } from './update-strategy-definition.dto';

describe('strategy definition DTOs', () => {
  it('accepts a paired V1 strategy payload', async () => {
    const dto = plainToInstance(CreateStrategyDefinitionDto, {
      name: 'Portfolio strategy',
      targetUniverse: ['600519'],
      periods: [Period.DAY],
      sources: [DataSource.TDX],
      entryRule: { field: 'k.close', operator: 'gt', value: 10 },
      exitRule: { field: 'k.close', operator: 'lt', value: 8 },
      lookbackBars: 1,
      backtestEnabled: false,
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });

  it('allows a live-only update without an exit rule while backtesting is disabled', async () => {
    const dto = plainToInstance(UpdateStrategyDefinitionDto, {
      entryRule: { field: 'k.close', operator: 'gt', value: 10 },
      lookbackBars: 1,
      backtestEnabled: false,
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });

  it('rejects the removed rule field and an out-of-range lookback', async () => {
    const dto = plainToInstance(CreateStrategyDefinitionDto, {
      name: 'Portfolio strategy',
      targetUniverse: ['600519'],
      periods: [Period.DAY],
      sources: [DataSource.TDX],
      rule: { field: 'k.close', operator: 'gt', value: 10 },
      entryRule: { field: 'k.close', operator: 'gt', value: 10 },
      lookbackBars: 251,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['rule', 'lookbackBars']),
    );
  });
});
