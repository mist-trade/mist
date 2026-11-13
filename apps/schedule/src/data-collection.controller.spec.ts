import { DataCollectionController } from './data-collection.controller';

describe('DataCollectionController scheduling', () => {
  const createHarness = (
    currentBeijingTime = new Date('2026-08-25T14:30:00Z'),
  ) => {
    const timezoneService = {
      getCurrentBeijingTime: jest.fn(() => currentBeijingTime),
      isTradingDay: jest.fn().mockResolvedValue(true),
      resolvePreviousTradingDay: jest
        .fn()
        .mockResolvedValue(new Date('2026-08-24T00:00:00Z')),
    };
    const preMarketInspectionService = {
      runInspection: jest.fn().mockResolvedValue({
        targetDate: '2026-08-25',
        overallStatus: 'PASSED',
        dimensions: {},
        sentToFeishu: true,
      }),
    };
    const controller = new DataCollectionController(
      timezoneService as any,
      preMarketInspectionService as any,
    );
    const logger = controller as any;
    jest.spyOn(logger.logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger.logger, 'debug').mockImplementation(() => undefined);
    jest.spyOn(logger.logger, 'error').mockImplementation(() => undefined);

    return {
      timezoneService,
      preMarketInspectionService,
      controller,
      logger: logger.logger,
    };
  };

  it('triggers pre-market inspection at 09:05 on trading days', async () => {
    const morning = new Date('2026-08-25T01:05:00Z'); // 09:05 Beijing
    const { preMarketInspectionService, controller, logger } =
      createHarness(morning);

    await controller.handlePreMarketInspection();

    expect(preMarketInspectionService.runInspection).toHaveBeenCalledWith(
      morning,
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('skips pre-market inspection on non-trading days', async () => {
    const sunday = new Date('2026-08-23T01:05:00Z');
    const { preMarketInspectionService, timezoneService, controller } =
      createHarness(sunday);
    timezoneService.isTradingDay.mockResolvedValue(false);

    await controller.handlePreMarketInspection();

    expect(preMarketInspectionService.runInspection).not.toHaveBeenCalled();
  });

  it('supports manual HTTP trigger for pre-market inspection', async () => {
    const { preMarketInspectionService, controller } = createHarness();
    const report = await controller.triggerPreMarketInspection();

    expect(report.targetDate).toBe('2026-08-25');
    expect(preMarketInspectionService.runInspection).toHaveBeenCalled();
  });
});
