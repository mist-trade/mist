import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';
import { ExperimentalTdxDiagnosticController } from './experimental-diagnostic.controller';
import { ExperimentalTdxRealtimeClient } from './experimental-tdx-realtime.client';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';

jest.setTimeout(30_000);

const datasourceRoot =
  process.env.MIST_DATASOURCE_REPLAY_ROOT ??
  resolve(process.cwd(), '../mist-datasource');
const describeCrossRepo = existsSync(datasourceRoot) ? describe : describe.skip;

async function freePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('failed to allocate replay port'));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function postJson<T>(url: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

describeCrossRepo('experimental TDX cross-repository HTTP/WS replay', () => {
  let datasource: ChildProcess | null = null;
  let datasourceLogs = '';

  afterEach(async () => {
    if (datasource && datasource.exitCode === null) {
      datasource.kill('SIGTERM');
      await new Promise<void>((resolveExit) => {
        const timer = setTimeout(resolveExit, 2_000);
        datasource?.once('exit', () => {
          clearTimeout(timer);
          resolveExit();
        });
      });
    }
    datasource = null;
  });

  it('flows fake terminal data through real FastAPI HTTP/WS into the Mist store', async () => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const python = resolve(datasourceRoot, '.venv/bin/python');
    datasource = spawn(
      python,
      [
        '-m',
        'uvicorn',
        'tests.integration.experimental_replay_app:app',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--log-level',
        'warning',
      ],
      { cwd: datasourceRoot, env: { ...process.env, PYTHONUNBUFFERED: '1' } },
    );
    for (const stream of [datasource.stdout, datasource.stderr]) {
      stream?.on('data', (chunk) => {
        datasourceLogs = (datasourceLogs + chunk.toString()).slice(-12_000);
      });
    }

    await waitFor(async () => {
      if (datasource?.exitCode !== null) {
        throw new Error(`datasource replay exited early:\n${datasourceLogs}`);
      }
      try {
        return (await fetch(`${baseUrl}/__test__/health`)).ok;
      } catch {
        return false;
      }
    }, 'datasource replay health');

    const ownerPayload = {
      ownerId: 'cross-repo-fake-terminal',
      mode: 'builtin_experimental',
      bridgeBuildId: 'cross-repo-test-build',
      bridgeArtifactSha256: 'cross-repo-test-sha',
      acquisitionProfile: 'tdx.get_market_snapshot',
      schemaVersion: 0,
      draftRevision: 1,
    };
    const owner1 = await postJson<{
      leaseToken: string;
      streamEpoch: string;
      generation: number;
    }>(`${baseUrl}/tdx/bridge/owner`, ownerPayload);

    const store = new InMemoryRealtimeStore();
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'TDX_BASE_URL') return baseUrl;
        if (key === 'TDX_WS_CLIENT_ID') return `mist-e2e-${port}`;
        if (key === 'TDX_WS_RECONNECT_DELAY_MS') return 100;
        if (key === 'TDX_EXPERIMENTAL_ALLOWLIST') return '600519.SH';
        return fallback;
      },
    } as ConfigService;
    const queryBuilder: Record<string, jest.Mock> = {};
    for (const method of ['innerJoin', 'where', 'andWhere', 'select']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawMany = jest
      .fn()
      .mockResolvedValue([{ formatCode: '600519.SH', securityId: 1 }]);
    const allowlist = new ExperimentalAllowlistResolver(
      config,
      { createQueryBuilder: () => queryBuilder } as any,
      {} as any,
    );
    await allowlist.onModuleInit();
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'BINARY cfg.formatCode = :formatCode',
      { formatCode: '600519.SH' },
    );
    const client = new ExperimentalTdxRealtimeClient(config, store, allowlist);
    let diagnosticApp: INestApplication | null = null;

    try {
      await client.onModuleInit();
      await waitFor(
        () =>
          store.isConnected && store.currentStreamEpoch === owner1.streamEpoch,
        'late-connect ready epoch recovery',
      );

      let poll1: {
        desiredRevision: number;
        desiredSymbols: string[];
      } | null = null;
      await waitFor(async () => {
        const currentPoll = await postJson<{
          desiredRevision: number;
          desiredSymbols: string[];
        }>(`${baseUrl}/tdx/bridge/poll`, {
          leaseToken: owner1.leaseToken,
          streamEpoch: owner1.streamEpoch,
          appliedRevision: -1,
        });
        poll1 = currentPoll;
        return currentPoll.desiredSymbols.includes('600519.SH');
      }, 'Mist desired-state publication');

      await postJson(`${baseUrl}/tdx/bridge/result`, {
        leaseToken: owner1.leaseToken,
        streamEpoch: owner1.streamEpoch,
        desiredRevision: poll1!.desiredRevision,
        appliedRevision: poll1!.desiredRevision,
        active: ['600519.SH'],
        rejected: [],
      });
      const capturedAt = new Date().toISOString();
      const native = {
        Code: '600519.SH',
        ErrorId: '0',
        Now: '1685.0',
        Open: '1670.0',
        Max: '1690.0',
        Min: '1665.0',
        LastClose: '1672.5',
        Volume: '12345600',
        Amount: '20800000000',
        AsOf: capturedAt,
      };
      await postJson(`${baseUrl}/tdx/bridge/snapshot`, {
        leaseToken: owner1.leaseToken,
        streamEpoch: owner1.streamEpoch,
        symbol: '600519.SH',
        producerSequence: 1,
        capturedAt,
        native,
      });
      await waitFor(
        () => store.readDebug('600519.SH')?.lastSequence === 1,
        'snapshot in Mist store',
      );

      const frame = store.readDebug('600519.SH')!.snapshot!;
      await postJson(`${baseUrl}/__test__/broadcast`, {
        type: 'tdx.experimental.snapshot',
        data: { ...frame, schemaVersion: 99, sequence: 2 },
      });
      await postJson(`${baseUrl}/__test__/broadcast`, {
        type: 'tdx.experimental.snapshot',
        data: { ...frame, sequence: 1 },
      });
      await postJson(`${baseUrl}/__test__/broadcast`, {
        type: 'tdx.experimental.snapshot',
        data: { ...frame, sequence: 3 },
      });
      await waitFor(
        () => store.readDebug('600519.SH')?.lastSequence === 3,
        'newer replay sequence',
      );
      await postJson(`${baseUrl}/__test__/broadcast`, {
        type: 'tdx.experimental.snapshot',
        data: { ...frame, sequence: 2 },
      });
      await postJson(`${baseUrl}/__test__/broadcast`, {
        type: 'tdx.experimental.snapshot',
        data: { ...frame, streamEpoch: 'stale-epoch', sequence: 4 },
      });
      await waitFor(
        () =>
          store.getDropCount('duplicate') === 1 &&
          store.getDropCount('outOfOrder') === 1 &&
          store.getDropCount('epochMismatch') === 1 &&
          store.getDropCount('contractMismatch') === 1,
        'duplicate/out-of-order/epoch rejection counters',
      );
      expect(store.readDebug('600519.SH')?.lastSequence).toBe(3);

      const owner2 = await postJson<{
        leaseToken: string;
        streamEpoch: string;
        generation: number;
      }>(`${baseUrl}/tdx/bridge/owner`, {
        ...ownerPayload,
        bridgeBuildId: 'cross-repo-test-build-2',
      });
      expect(owner2.generation).toBeGreaterThan(owner1.generation);
      await waitFor(
        () =>
          store.currentStreamEpoch === owner2.streamEpoch &&
          store.activeSymbolCount === 0,
        'stream_started epoch switch',
      );

      let poll2: {
        desiredRevision: number;
        desiredSymbols: string[];
      } | null = null;
      await waitFor(async () => {
        const currentPoll = await postJson<{
          desiredRevision: number;
          desiredSymbols: string[];
        }>(`${baseUrl}/tdx/bridge/poll`, {
          leaseToken: owner2.leaseToken,
          streamEpoch: owner2.streamEpoch,
          appliedRevision: -1,
        });
        poll2 = currentPoll;
        return currentPoll.desiredSymbols.includes('600519.SH');
      }, 'desired state after stream_started');
      await postJson(`${baseUrl}/tdx/bridge/result`, {
        leaseToken: owner2.leaseToken,
        streamEpoch: owner2.streamEpoch,
        desiredRevision: poll2!.desiredRevision,
        appliedRevision: poll2!.desiredRevision,
        active: ['600519.SH'],
        rejected: [],
      });
      await postJson(`${baseUrl}/tdx/bridge/snapshot`, {
        leaseToken: owner2.leaseToken,
        streamEpoch: owner2.streamEpoch,
        symbol: '600519.SH',
        producerSequence: 1,
        capturedAt: new Date().toISOString(),
        native,
      });
      await waitFor(
        () =>
          store.readDebug('600519.SH')?.epoch === owner2.streamEpoch &&
          store.readDebug('600519.SH')?.lastSequence === 1,
        'new epoch snapshot',
      );

      const diagnosticModule = await Test.createTestingModule({
        controllers: [ExperimentalTdxDiagnosticController],
        providers: [
          { provide: InMemoryRealtimeStore, useValue: store },
          { provide: ExperimentalAllowlistResolver, useValue: allowlist },
        ],
      }).compile();
      diagnosticApp = diagnosticModule.createNestApplication();
      await diagnosticApp.init();
      const symbolDiagnostic = await request(diagnosticApp.getHttpServer())
        .get('/internal/experimental/tdx/realtime/600519.SH')
        .expect(200);
      expect(symbolDiagnostic.body.epoch).toBe(owner2.streamEpoch);
      expect(symbolDiagnostic.body.lastSequence).toBe(1);
      expect(symbolDiagnostic.body.latestAgeMs).toEqual(expect.any(Number));
      expect(symbolDiagnostic.body.dropCounts).toMatchObject({
        duplicate: 1,
        outOfOrder: 1,
        epochMismatch: 1,
      });
      const statusDiagnostic = await request(diagnosticApp.getHttpServer())
        .get('/internal/experimental/tdx/realtime/status')
        .expect(200);
      expect(statusDiagnostic.body.activeSymbols).toContain('600519.SH');
      expect(statusDiagnostic.body).toMatchObject({
        ready: true,
        ownerId: 'cross-repo-fake-terminal',
        datasourceBuildId: 'mist-datasource-experimental',
        bridgeBuildId: 'cross-repo-test-build-2',
        currentGeneration: owner2.generation,
        dropCounts: {
          contractMismatch: 1,
          duplicate: 1,
          outOfOrder: 1,
          epochMismatch: 1,
        },
      });
      expect(statusDiagnostic.body.lastDrop).toMatchObject({
        reason: 'epochMismatch',
        symbol: '600519.SH',
      });
    } finally {
      if (diagnosticApp) await diagnosticApp.close();
      await client.onModuleDestroy();
    }
  });

  it('runs the positive vertical slice through production tdx.main wiring', async () => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    datasourceLogs = '';
    datasource = spawn(
      resolve(datasourceRoot, '.venv/bin/python'),
      [
        '-m',
        'uvicorn',
        'tdx.main:app',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--log-level',
        'warning',
      ],
      {
        cwd: datasourceRoot,
        env: {
          ...process.env,
          APP_ENV: 'development',
          PYTHONUNBUFFERED: '1',
        },
      },
    );
    for (const stream of [datasource.stdout, datasource.stderr]) {
      stream?.on('data', (chunk) => {
        datasourceLogs = (datasourceLogs + chunk.toString()).slice(-12_000);
      });
    }
    await waitFor(async () => {
      if (datasource?.exitCode !== null) {
        throw new Error(
          `production datasource exited early:\n${datasourceLogs}`,
        );
      }
      try {
        return (await fetch(`${baseUrl}/health`)).ok;
      } catch {
        return false;
      }
    }, 'production datasource health');

    const owner = await postJson<{
      leaseToken: string;
      streamEpoch: string;
      generation: number;
    }>(`${baseUrl}/tdx/bridge/owner`, {
      ownerId: 'production-wiring-terminal',
      mode: 'builtin_experimental',
      bridgeBuildId: 'production-wiring-build',
      bridgeArtifactSha256: 'production-wiring-sha',
      acquisitionProfile: 'tdx.get_market_snapshot',
      schemaVersion: 0,
      draftRevision: 1,
    });
    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'TDX_BASE_URL') return baseUrl;
        if (key === 'TDX_WS_CLIENT_ID') return `mist-production-e2e-${port}`;
        if (key === 'TDX_WS_RECONNECT_DELAY_MS') return 100;
        if (key === 'TDX_EXPERIMENTAL_ALLOWLIST') return '600519.SH';
        return fallback;
      },
    } as ConfigService;
    const queryBuilder: Record<string, jest.Mock> = {};
    for (const method of ['innerJoin', 'where', 'andWhere', 'select']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawMany = jest
      .fn()
      .mockResolvedValue([{ formatCode: '600519.SH', securityId: 1 }]);
    const allowlist = new ExperimentalAllowlistResolver(
      config,
      { createQueryBuilder: () => queryBuilder } as any,
      {} as any,
    );
    await allowlist.onModuleInit();
    const store = new InMemoryRealtimeStore();
    const client = new ExperimentalTdxRealtimeClient(config, store, allowlist);
    try {
      await client.onModuleInit();
      await waitFor(
        () => store.currentStreamEpoch === owner.streamEpoch,
        'production ready recovery',
      );
      let revision = -1;
      await waitFor(async () => {
        const poll = await postJson<{
          desiredRevision: number;
          desiredSymbols: string[];
        }>(`${baseUrl}/tdx/bridge/poll`, {
          leaseToken: owner.leaseToken,
          streamEpoch: owner.streamEpoch,
          appliedRevision: -1,
        });
        revision = poll.desiredRevision;
        return poll.desiredSymbols.includes('600519.SH');
      }, 'production desired publication');
      await postJson(`${baseUrl}/tdx/bridge/result`, {
        leaseToken: owner.leaseToken,
        streamEpoch: owner.streamEpoch,
        desiredRevision: revision,
        appliedRevision: revision,
        active: ['600519.SH'],
        rejected: [],
      });
      const capturedAt = new Date().toISOString();
      await postJson(`${baseUrl}/tdx/bridge/snapshot`, {
        leaseToken: owner.leaseToken,
        streamEpoch: owner.streamEpoch,
        symbol: '600519.SH',
        producerSequence: 1,
        capturedAt,
        native: {
          Code: '600519.SH',
          ErrorId: '0',
          Now: '1685.0',
          AsOf: capturedAt,
        },
      });
      await waitFor(
        () => store.readDebug('600519.SH')?.lastSequence === 1,
        'production-wired snapshot',
      );
      expect(store.getRuntimeMetadata()).toMatchObject({
        ownerId: 'production-wiring-terminal',
        bridgeBuildId: 'production-wiring-build',
        currentGeneration: owner.generation,
      });
    } finally {
      await client.onModuleDestroy();
    }
  });
});
