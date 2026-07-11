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
});
