import { Period } from '@app/shared-data';
import { DataCollectionController } from './data-collection.controller';

describe('DataCollectionController strategy scan scheduling', () => {
  const createHarness = () => {
    const collectionStrategy = {
      collectForAllSecurities: jest.fn().mockResolvedValue(undefined),
    };
    const timezoneService = {
      getCurrentBeijingTime: jest.fn(() => new Date('2026-07-07T10:00:00Z')),
      isTradingDay: jest.fn().mockResolvedValue(true),
    };
    const strategyScanService = {
      runScan: jest.fn().mockResolvedValue({
        scannedStrategies: 2,
        evaluatedContexts: 3,
        createdSignals: 1,
        createdAlertEvents: 1,
        skippedDuplicates: 0,
      }),
    };
    const controller = new (DataCollectionController as any)(
      collectionStrategy,
      timezoneService,
      strategyScanService,
    ) as DataCollectionController;
    const logger = controller as any;
    jest.spyOn(logger.logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger.logger, 'error').mockImplementation(() => undefined);

    return {
      collectionStrategy,
      timezoneService,
      strategyScanService,
      controller,
      logger: logger.logger,
    };
  };

  it('triggers a strategy scan for the same period after collection succeeds', async () => {
    const { collectionStrategy, strategyScanService, controller, logger } =
      createHarness();

    await controller.handleDailyCollection();

    expect(collectionStrategy.collectForAllSecurities).toHaveBeenCalledWith(
      Period.DAY,
    );
    expect(strategyScanService.runScan).toHaveBeenCalledWith({
      period: Period.DAY,
    });
    expect(logger.log).toHaveBeenCalledWith(
      'Daily strategy scan completed: scannedStrategies=2, evaluatedContexts=3, createdSignals=1, createdAlertEvents=1, skippedDuplicates=0',
    );
  });

  it('does not trigger a strategy scan when collection fails', async () => {
    const { collectionStrategy, strategyScanService, controller, logger } =
      createHarness();
    collectionStrategy.collectForAllSecurities.mockRejectedValueOnce(
      new Error('collector offline'),
    );

    await controller.handleDailyCollection();

    expect(strategyScanService.runScan).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Daily collection failed: collector offline',
    );
  });
});
