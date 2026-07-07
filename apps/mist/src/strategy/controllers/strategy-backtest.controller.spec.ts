import { StrategyBacktestController } from './strategy-backtest.controller';

describe('StrategyBacktestController', () => {
  it('delegates pending backtest run commands to the backtest service', async () => {
    const service = {
      createRun: jest.fn().mockResolvedValue({ id: 1 }),
      findRun: jest.fn().mockResolvedValue({ id: 1 }),
      listSignals: jest.fn().mockResolvedValue([]),
    };
    const controller = new StrategyBacktestController(service as any);
    const dto = {
      strategyVersionId: 1,
      targetUniverse: ['600519'],
      period: 1440,
      source: 'tdx',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    } as any;

    await controller.createRun(dto);
    await controller.findRun('1');
    await controller.listSignals('1');

    expect(service.createRun).toHaveBeenCalledWith(dto);
    expect(service.findRun).toHaveBeenCalledWith(1);
    expect(service.listSignals).toHaveBeenCalledWith(1);
  });
});
