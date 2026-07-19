import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CollectorService } from '../../../collector/collector.service';
import { StrategyScanService } from '../../../strategy/scanner/strategy-scan.service';
import { StrategyAlertEventService } from '../../../strategy/services/strategy-alert-event.service';
import { StrategySignalService } from '../../../strategy/services/strategy-signal.service';
import { KCandleAggregator } from '../../tdx/kcandle-aggregator';
import { ExperimentalQmtAllowlistResolver } from './experimental-qmt-allowlist.resolver';
import { ExperimentalQmtRealtimeClient } from './experimental-qmt-realtime.client';
import { ExperimentalQmtRealtimeModule } from './experimental-qmt-realtime.module';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

const scheduleModuleSource = readFileSync(
  resolve(process.cwd(), 'apps/schedule/src/schedule.module.ts'),
  'utf8',
);

const fakeDataSource = {
  entityMetadatas: [],
  options: { type: 'mysql' },
  getRepository: jest.fn(() => ({})),
};

@Global()
@Module({
  providers: [
    { provide: getDataSourceToken(), useValue: fakeDataSource },
    {
      provide: ConfigService,
      useValue: { get: (_key: string, fallback?: unknown) => fallback },
    },
  ],
  exports: [getDataSourceToken(), ConfigService],
})
class FakeRuntimeDependenciesModule {}

describe('experimental QMT DI mode and poison boundary', () => {
  it('resolves only identity, client, store, and diagnostics dependencies', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeRuntimeDependenciesModule, ExperimentalQmtRealtimeModule],
    })
      .overrideProvider(ExperimentalQmtRealtimeClient)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(ExperimentalQmtAllowlistResolver)
      .useValue({ entriesList: [], isAuthorized: jest.fn() })
      .compile();

    expect(moduleRef.get(InMemoryQmtRealtimeStore)).toBeInstanceOf(
      InMemoryQmtRealtimeStore,
    );
    for (const poisonToken of [
      CollectorService,
      KCandleAggregator,
      StrategyScanService,
      StrategySignalService,
      StrategyAlertEventService,
    ]) {
      expect(() => moduleRef.get(poisonToken, { strict: false })).toThrow();
    }
    await moduleRef.close();
  });

  it('is absent from the schedule module graph', () => {
    expect(scheduleModuleSource).not.toContain('ExperimentalQmtRealtimeModule');
    expect(scheduleModuleSource).not.toContain('ExperimentalQmtRealtimeClient');
    expect(scheduleModuleSource).not.toContain('QmtRealtime');
  });
});
