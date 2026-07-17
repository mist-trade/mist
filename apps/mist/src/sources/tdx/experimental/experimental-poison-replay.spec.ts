import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CollectorService } from '../../../collector/collector.service';
import { StrategyScanService } from '../../../strategy/scanner/strategy-scan.service';
import { StrategySignalService } from '../../../strategy/services/strategy-signal.service';
import { StrategyAlertEventService } from '../../../strategy/services/strategy-alert-event.service';
import { KCandleAggregator } from '../kcandle-aggregator';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';
import { ExperimentalTdxRealtimeClient } from './experimental-tdx-realtime.client';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';

describe('experimental TDX activated poison replay', () => {
  it('updates only the latest-snapshot store and never enters persistence or business paths', async () => {
    const poison = (): never => {
      throw new Error('POISON: experimental realtime crossed a no-K boundary');
    };
    const poisonSpies = [
      jest
        .spyOn(KCandleAggregator.prototype, 'process')
        .mockImplementation(poison),
      jest
        .spyOn(CollectorService.prototype, 'saveRawKData')
        .mockImplementation(poison),
      jest
        .spyOn(StrategyScanService.prototype, 'runScan')
        .mockImplementation(poison),
      jest
        .spyOn(StrategySignalService.prototype, 'findAll')
        .mockImplementation(poison),
      jest
        .spyOn(StrategyAlertEventService.prototype, 'markDelivered')
        .mockImplementation(poison),
      jest.spyOn(Repository.prototype, 'save').mockImplementation(poison),
      jest.spyOn(Repository.prototype, 'insert').mockImplementation(poison),
      jest.spyOn(Repository.prototype, 'update').mockImplementation(poison),
      jest.spyOn(Repository.prototype, 'upsert').mockImplementation(poison),
      jest.spyOn(Repository.prototype, 'delete').mockImplementation(poison),
    ];

    try {
      const store = new InMemoryRealtimeStore();
      const allowlist = {
        entriesList: [{ formatCode: '600519.SH', securityId: 1 }],
        isAuthorized: (symbol: string) => symbol === '600519.SH',
      } as unknown as ExperimentalAllowlistResolver;
      const config = {
        get: (key: string, fallback?: unknown) => {
          if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
          if (key === 'TDX_WS_CLIENT_ID') return 'poison-replay';
          return fallback;
        },
      } as ConfigService;
      const client = new ExperimentalTdxRealtimeClient(
        config,
        store,
        allowlist,
        jest.fn().mockResolvedValue(undefined),
      );
      const ingest = (payload: object) =>
        (
          client as unknown as {
            handleMessage(raw: string): Promise<void>;
          }
        ).handleMessage(JSON.stringify(payload));

      await ingest({
        type: 'ready',
        data: {
          mode: 'builtin_experimental',
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          acquisitionProfile: 'tdx.get_market_snapshot',
          currentStreamEpoch: 'poison-epoch',
          currentGeneration: 1,
        },
      });
      await ingest({
        type: 'tdx.experimental.snapshot',
        data: {
          payloadType: 'tdx.realtime.snapshot',
          schemaVersion: 0,
          draftRevision: 1,
          contractStatus: 'experimental',
          acquisitionProfile: 'tdx.get_market_snapshot',
          streamEpoch: 'poison-epoch',
          sequence: 1,
          symbol: '600519.SH',
          capturedAt: '2026-07-17T14:30:01.000+08:00',
          eventTime: '2026-07-17T14:30:00.000+08:00',
          snapshot: {
            last: 1685,
            open: 1670,
            high: 1690,
            low: 1665,
            lastClose: 1672.5,
            nativeVolume: 12345600,
            nativeAmount: 20800000000,
          },
          unitStatus: 'native-unverified',
          quality: {},
        },
      });

      expect(store.readDebug('600519.SH')?.lastSequence).toBe(1);
      for (const spy of poisonSpies) expect(spy).not.toHaveBeenCalled();
      await client.onModuleDestroy();
    } finally {
      jest.restoreAllMocks();
    }
  });
});
