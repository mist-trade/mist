import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { StrategyBacktestController } from './strategy-backtest.controller';

describe('StrategyBacktestController', () => {
  it('delegates pending backtest run commands to the backtest service', async () => {
    const service = {
      createRun: jest.fn().mockResolvedValue({ id: 1 }),
      listRuns: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 1 }], nextCursor: null }),
      findRun: jest.fn().mockResolvedValue({ id: 1 }),
      cancelRun: jest.fn().mockResolvedValue({ id: 1 }),
      listEquity: jest.fn().mockResolvedValue([]),
      listSignals: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listOrders: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listTrades: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      listPositions: jest
        .fn()
        .mockResolvedValue({ items: [], nextCursor: null }),
    };
    const controller = new StrategyBacktestController(service as any);
    const dto = {
      strategyDefinitionId: 1,
      strategyVersionId: 1,
      targetUniverse: ['600519'],
      period: 1440,
      source: 'tdx',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    } as any;

    await controller.createRun(dto);
    await controller.listRuns('1', 'pending' as any, 'run-cursor', '25');
    await controller.findRun('1');
    await controller.cancelRun('1');
    await controller.listEquity('1');
    await controller.listSignals('1', 'signal-cursor', '5');
    await controller.listOrders('1', 'order-cursor', '10');
    await controller.listTrades('1', 'trade-cursor', '15');
    await controller.listPositions('1', '2026-01-01', 'position-cursor', '20');

    expect(service.createRun).toHaveBeenCalledWith(dto);
    expect(service.listRuns).toHaveBeenCalledWith({
      strategyDefinitionId: 1,
      status: 'pending',
      cursor: 'run-cursor',
      limit: 25,
    });
    expect(service.findRun).toHaveBeenCalledWith(1);
    expect(service.cancelRun).toHaveBeenCalledWith(1);
    expect(service.listEquity).toHaveBeenCalledWith(1);
    expect(service.listSignals).toHaveBeenCalledWith(1, {
      cursor: 'signal-cursor',
      limit: 5,
    });
    expect(service.listOrders).toHaveBeenCalledWith(1, {
      cursor: 'order-cursor',
      limit: 10,
    });
    expect(service.listTrades).toHaveBeenCalledWith(1, {
      cursor: 'trade-cursor',
      limit: 15,
    });
    expect(service.listPositions).toHaveBeenCalledWith(
      1,
      new Date('2026-01-01'),
      {
        cursor: 'position-cursor',
        limit: 20,
      },
    );
  });

  it('marks portfolio run creation as an accepted asynchronous request', () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        StrategyBacktestController.prototype.createRun,
      ),
    ).toBe(HttpStatus.ACCEPTED);
  });
});
