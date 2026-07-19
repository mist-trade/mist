import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { ExperimentalTdxRealtimeModule } from './experimental-tdx-realtime.module';
import { ExperimentalTdxRealtimeClient } from './experimental-tdx-realtime.client';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { TdxWebSocketService } from '../tdx-websocket.service';
import { KCandleAggregator } from '../kcandle-aggregator';
import { WebSocketCollectionStrategy } from '../../../collector/strategies/websocket-collection.strategy';

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

describe('experimental TDX DI and route mode matrix', () => {
  const experimentalClient = {
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };
  const allowlist = { entriesList: [], isAuthorized: jest.fn() };

  it('builtin mode cannot resolve legacy providers and does not mount legacy routes', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeRuntimeDependenciesModule, ExperimentalTdxRealtimeModule],
    })
      .overrideProvider(ExperimentalTdxRealtimeClient)
      .useValue(experimentalClient)
      .overrideProvider(ExperimentalAllowlistResolver)
      .useValue(allowlist)
      .compile();

    for (const token of [
      TdxWebSocketService,
      KCandleAggregator,
      WebSocketCollectionStrategy,
    ]) {
      expect(() => moduleRef.get(token, { strict: false })).toThrow();
    }

    const app = moduleRef.createNestApplication();
    await app.init();
    await request(app.getHttpServer())
      .post('/v1/collector/test/tdx-streaming/subscribe')
      .send({ code: '600519', period: 1, testOnly: true })
      .expect(404);
    await request(app.getHttpServer())
      .post('/v1/collector/test/tdx-streaming/unsubscribe')
      .send({ code: '600519', period: 1, testOnly: true })
      .expect(404);
    await app.close();
  });

  it('schedule module source contains no realtime WS graph', () => {
    expect(scheduleModuleSource).not.toContain('ExperimentalTdxRealtimeModule');
    expect(scheduleModuleSource).not.toContain('ExperimentalTdxRealtimeClient');
    expect(scheduleModuleSource).not.toContain('TdxWebSocketService');
    expect(scheduleModuleSource).not.toContain('LegacyTdxStreamingController');
  });

  it('off-mode container has no realtime providers', async () => {
    const moduleRef = await Test.createTestingModule({}).compile();
    expect(() =>
      moduleRef.get(ExperimentalTdxRealtimeClient, { strict: false }),
    ).toThrow();
    expect(() =>
      moduleRef.get(TdxWebSocketService, { strict: false }),
    ).toThrow();
    await moduleRef.close();
  });

  it('keeps the experimental store resolvable in builtin mode', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeRuntimeDependenciesModule, ExperimentalTdxRealtimeModule],
    })
      .overrideProvider(ExperimentalTdxRealtimeClient)
      .useValue(experimentalClient)
      .overrideProvider(ExperimentalAllowlistResolver)
      .useValue(allowlist)
      .compile();
    expect(moduleRef.get(InMemoryRealtimeStore)).toBeInstanceOf(
      InMemoryRealtimeStore,
    );
    await moduleRef.close();
  });
});
