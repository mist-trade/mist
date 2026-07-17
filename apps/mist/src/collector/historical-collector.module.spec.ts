import { Test } from '@nestjs/testing';
import { DataSource } from '@app/shared-data';
import { COLLECTION_STRATEGIES } from './strategies/collection-strategy.registry';
import { IDataCollectionStrategy } from './strategies/data-collection.strategy.interface';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';
import { TdxCollectionStrategy } from './strategies/tdx-collection.strategy';
import { QmtCollectionStrategy } from './strategies/qmt-collection.strategy';
import { COLLECTION_STRATEGIES_PROVIDER } from './historical-collector.module';

describe('HistoricalCollectorModule strategy provider', () => {
  it('registers only the three polling collection strategies', async () => {
    const eastMoneyStrategy = {
      source: DataSource.EAST_MONEY,
      mode: 'polling',
    } as IDataCollectionStrategy;
    const tdxStrategy = {
      source: DataSource.TDX,
      mode: 'polling',
    } as IDataCollectionStrategy;
    const qmtStrategy = {
      source: DataSource.QMT,
      mode: 'polling',
    } as IDataCollectionStrategy;

    const moduleRef = await Test.createTestingModule({
      providers: [
        COLLECTION_STRATEGIES_PROVIDER,
        { provide: EastMoneyCollectionStrategy, useValue: eastMoneyStrategy },
        { provide: TdxCollectionStrategy, useValue: tdxStrategy },
        { provide: QmtCollectionStrategy, useValue: qmtStrategy },
      ],
    }).compile();

    expect(
      moduleRef.get<IDataCollectionStrategy[]>(COLLECTION_STRATEGIES),
    ).toEqual([eastMoneyStrategy, tdxStrategy, qmtStrategy]);

    await moduleRef.close();
  });
});
