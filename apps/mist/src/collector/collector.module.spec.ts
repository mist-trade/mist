import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';
import { COLLECTION_STRATEGIES } from './strategies/collection-strategy.registry';
import { IDataCollectionStrategy } from './strategies/data-collection.strategy.interface';
import { CollectorService } from './collector.service';
import { EastMoneyCollectionStrategy } from './strategies/east-money-collection.strategy';
import { TdxCollectionStrategy } from './strategies/tdx-collection.strategy';
import { WebSocketCollectionStrategy } from './strategies/websocket-collection.strategy';
import { TdxWebSocketService } from '../sources/tdx/tdx-websocket.service';
import {
  COLLECTION_STRATEGIES_PROVIDER,
  TDX_WEBSOCKET_COLLECTION_STRATEGY_PROVIDER,
} from './collector.module';

describe('CollectorModule strategy providers', () => {
  it('constructs the TDX WebSocket ingest strategy without replacing manual TDX strategy', async () => {
    const eastMoneyStrategy = {
      source: DataSource.EAST_MONEY,
      mode: 'polling',
    } as IDataCollectionStrategy;
    const tdxManualStrategy = {
      source: DataSource.TDX,
      mode: 'polling',
    } as IDataCollectionStrategy;
    const tdxWsService = {
      onBar: jest.fn(),
      onCandleComplete: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      getConnectionStatus: jest.fn().mockReturnValue('connected'),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TDX_WEBSOCKET_COLLECTION_STRATEGY_PROVIDER,
        COLLECTION_STRATEGIES_PROVIDER,
        {
          provide: CollectorService,
          useValue: {
            findSecurityByCode: jest.fn(),
            saveRawKData: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: {} },
        { provide: TdxWebSocketService, useValue: tdxWsService },
        { provide: EastMoneyCollectionStrategy, useValue: eastMoneyStrategy },
        { provide: TdxCollectionStrategy, useValue: tdxManualStrategy },
      ],
    }).compile();

    const streamingStrategy = moduleRef.get(WebSocketCollectionStrategy);
    const manualStrategies = moduleRef.get<IDataCollectionStrategy[]>(
      COLLECTION_STRATEGIES,
    );

    expect(streamingStrategy).toBeInstanceOf(WebSocketCollectionStrategy);
    expect(tdxWsService.onBar).toHaveBeenCalledTimes(1);
    expect(manualStrategies).toEqual([eastMoneyStrategy, tdxManualStrategy]);
    expect(
      manualStrategies.find((strategy) => strategy.source === DataSource.TDX),
    ).toBe(tdxManualStrategy);
    expect(manualStrategies).not.toContain(streamingStrategy);

    await moduleRef.close();
  });
});
