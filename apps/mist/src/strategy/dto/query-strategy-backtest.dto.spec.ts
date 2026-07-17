import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  StrategyBacktestPositionQueryDto,
  StrategyBacktestRunListQueryDto,
  StrategyBacktestRunParamDto,
} from './query-strategy-backtest.dto';

describe('strategy backtest query DTOs', () => {
  it('transforms valid numeric path and query fields once', async () => {
    const params = plainToInstance(StrategyBacktestRunParamDto, { runId: '7' });
    const query = plainToInstance(StrategyBacktestRunListQueryDto, {
      strategyDefinitionId: '3',
      status: 'running',
      cursor: 'opaque',
      limit: '25',
    });

    await expect(validate(params)).resolves.toEqual([]);
    await expect(validate(query)).resolves.toEqual([]);
    expect(params.runId).toBe(7);
    expect(query).toMatchObject({
      strategyDefinitionId: 3,
      status: 'running',
      cursor: 'opaque',
      limit: 25,
    });
  });

  it.each([
    [StrategyBacktestRunParamDto, { runId: '0' }],
    [StrategyBacktestRunParamDto, { runId: 'abc' }],
    [StrategyBacktestRunListQueryDto, { strategyDefinitionId: '-1' }],
    [StrategyBacktestRunListQueryDto, { status: 'unknown' }],
    [StrategyBacktestRunListQueryDto, { limit: '201' }],
    [StrategyBacktestPositionQueryDto, { asOf: '2026-02-30' }],
    [StrategyBacktestPositionQueryDto, { asOf: '2026/01/01' }],
  ])('rejects invalid request boundary %p', async (Dto, value) => {
    const errors = await validate(
      plainToInstance(Dto as new () => object, value),
    );
    expect(errors).not.toHaveLength(0);
  });
});
