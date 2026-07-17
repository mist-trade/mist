import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, Period } from '@app/shared-data';
import { CreateBacktestRunDto } from './create-backtest-run.dto';

describe('CreateBacktestRunDto', () => {
  it('accepts a current-version portfolio request with execution defaults omitted', async () => {
    const dto = plainToInstance(CreateBacktestRunDto, {
      strategyDefinitionId: 3,
      targetUniverse: ['600519'],
      period: Period.DAY,
      source: DataSource.TDX,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toEqual([]);
  });

  it('rejects EF because V1 portfolio backtests require a declared adjusted-price contract', async () => {
    const dto = plainToInstance(CreateBacktestRunDto, {
      strategyDefinitionId: 3,
      targetUniverse: ['600519'],
      period: Period.DAY,
      source: DataSource.EAST_MONEY,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'source' })]),
    );
  });

  it('accepts the CNY ceiling and rejects initial cash or minimum commission above it', async () => {
    const request = {
      strategyDefinitionId: 3,
      targetUniverse: ['600519'],
      period: Period.DAY,
      source: DataSource.TDX,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      initialCash: 1e12,
      minCommission: 1e12,
    };

    await expect(
      validate(plainToInstance(CreateBacktestRunDto, request)),
    ).resolves.toEqual([]);

    const errors = await validate(
      plainToInstance(CreateBacktestRunDto, {
        ...request,
        initialCash: 1e12 + 1,
        minCommission: 1e12 + 1,
      }),
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      'initialCash',
      'minCommission',
    ]);
  });
});
