import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { ExperimentalTdxDiagnosticController } from './experimental-diagnostic.controller';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';

describe('ExperimentalTdxDiagnosticController loopback guard', () => {
  const store = new InMemoryRealtimeStore();
  const controller = new ExperimentalTdxDiagnosticController(store, {
    entriesList: [],
  } as any);

  function requestFrom(ip: string): Request {
    return { ip, socket: { remoteAddress: ip } } as unknown as Request;
  }

  it.each(['127.0.0.1', '127.23.4.5', '::1', '::ffff:127.0.0.1'])(
    'allows loopback address %s',
    (ip) => {
      expect(() => controller.getStatus(requestFrom(ip))).not.toThrow();
    },
  );

  it.each(['10.127.0.0.1', '::ffff:10.127.0.0', 'evil-127.0.0.1.test'])(
    'rejects non-loopback address %s',
    (ip) => {
      expect(() => controller.getStatus(requestFrom(ip))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('reports owner/build/generation and complete drop diagnostics', () => {
    store.markConnected();
    store.beginEpoch('epoch-7');
    store.updateRuntimeMetadata({
      ready: true,
      ownerId: 'terminal-owner',
      datasourceBuildId: 'datasource-build',
      bridgeBuildId: 'bridge-build',
      currentGeneration: 7,
    });
    store.recordDrop(
      'contractMismatch',
      '600519.SH',
      'TDX_EXPERIMENTAL_CONTRACT_MISMATCH',
    );
    store.setRuntimeError(
      'TDX_EXPERIMENTAL_CONTRACT_MISMATCH',
      'contract mismatch',
    );

    const status = controller.getStatus(requestFrom('127.0.0.1'));
    expect(status).toMatchObject({
      ready: true,
      ownerId: 'terminal-owner',
      datasourceBuildId: 'datasource-build',
      bridgeBuildId: 'bridge-build',
      currentGeneration: 7,
      currentStreamEpoch: 'epoch-7',
      dropCounts: { contractMismatch: 1 },
      lastDrop: {
        reason: 'contractMismatch',
        symbol: '600519.SH',
        errorCode: 'TDX_EXPERIMENTAL_CONTRACT_MISMATCH',
      },
      lastError: { code: 'TDX_EXPERIMENTAL_CONTRACT_MISMATCH' },
    });
  });
});
