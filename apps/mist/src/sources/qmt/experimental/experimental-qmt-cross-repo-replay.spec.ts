import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';
import { ExperimentalQmtAllowlistResolver } from './experimental-qmt-allowlist.resolver';
import { ExperimentalQmtRealtimeClient } from './experimental-qmt-realtime.client';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

jest.setTimeout(30_000);

const datasourceRoot =
  process.env.MIST_DATASOURCE_REPLAY_ROOT ??
  resolve(process.cwd(), '../mist-datasource');
const describeCrossRepo = existsSync(datasourceRoot) ? describe : describe.skip;
const replayNow = '2026-07-14T10:00:00+08:00';

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
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
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
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

describeCrossRepo('experimental QMT production-wiring replay', () => {
  let datasource: ChildProcess | null = null;
  let logs = '';

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

  it('flows get_full_tick through FastAPI WS into the real resolver and store', async () => {
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    datasource = spawn(
      resolve(datasourceRoot, '.venv/bin/python'),
      [
        '-m',
        'uvicorn',
        'tests.integration.qmt_experimental_replay_app:app',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--log-level',
        'warning',
      ],
      {
        cwd: datasourceRoot,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      },
    );
    for (const stream of [datasource.stdout, datasource.stderr]) {
      stream?.on('data', (chunk) => {
        logs = (logs + chunk.toString()).slice(-12_000);
      });
    }
    await waitFor(async () => {
      if (datasource?.exitCode !== null) {
        throw new Error(`QMT replay exited early:\n${logs}`);
      }
      try {
        return (await fetch(`${baseUrl}/health`)).ok;
      } catch {
        return false;
      }
    }, 'QMT datasource health');

    const config = {
      get: (key: string, fallback?: unknown) => {
        if (key === 'QMT_BASE_URL') return baseUrl;
        if (key === 'QMT_WS_CLIENT_ID') return `mist-qmt-replay-${port}`;
        if (key === 'QMT_WS_RECONNECT_DELAY_MS') return 100;
        if (key === 'QMT_EXPERIMENTAL_ALLOWLIST') return '600519.SH';
        return fallback;
      },
    } as ConfigService;
    const queryBuilder: Record<string, jest.Mock> = {};
    for (const method of ['innerJoin', 'where', 'andWhere', 'select']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawMany = jest
      .fn()
      .mockResolvedValue([{ formatCode: '600519.SH', securityId: 7 }]);
    const allowlist = new ExperimentalQmtAllowlistResolver(config, {
      createQueryBuilder: () => queryBuilder,
    } as never);
    await allowlist.onModuleInit();
    expect(queryBuilder.where).toHaveBeenCalledWith('cfg.source = :source', {
      source: DataSource.QMT,
    });

    const store = new InMemoryQmtRealtimeStore();
    const client = new ExperimentalQmtRealtimeClient(
      config,
      store,
      allowlist,
      () => Date.parse(replayNow),
    );
    client.onModuleInit();
    try {
      await waitFor(
        () => store.status().connected && store.currentEpoch !== null,
        'QMT ready frame',
      );
      const initialEpoch = store.currentEpoch;
      await postJson(`${baseUrl}/qmt/bridge/owner`, {
        ownerId: 'qmt-replay-owner',
      });
      await waitFor(
        () =>
          store.currentEpoch !== null && store.currentEpoch !== initialEpoch,
        'QMT owner epoch transition',
      );

      let commandId = '';
      await waitFor(async () => {
        const response = await postJson<{
          commands: Array<{ commandId: string; method: string }>;
        }>(`${baseUrl}/qmt/bridge/poll`, {
          ownerId: 'qmt-replay-owner',
          limit: 1,
        });
        const command = response.commands[0];
        if (!command) return false;
        expect(command.method).toBe('get_full_tick');
        commandId = command.commandId;
        return true;
      }, 'QMT native command');

      await postJson(`${baseUrl}/qmt/bridge/result`, {
        ownerId: 'qmt-replay-owner',
        commandId,
        ok: true,
        result: {
          '600519.SH': {
            timetag: '20260714100000',
            lastPrice: 1500,
            open: 1490,
            high: 1510,
            low: 1480,
            lastClose: 1495,
            volume: 100,
            amount: 150000,
          },
        },
      });
      await waitFor(
        () => store.read('600519.SH')?.snapshot.native.lastPrice === 1500,
        'QMT snapshot in Mist store',
      );
      expect(store.read('600519.SH')).toMatchObject({
        sequence: 1,
        fresh: true,
      });
      expect(store.status().dropCounts).toEqual({});
    } finally {
      client.onModuleDestroy();
    }
  });
});
