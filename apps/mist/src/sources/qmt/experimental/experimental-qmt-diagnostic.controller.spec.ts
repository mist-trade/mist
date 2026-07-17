import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { ExperimentalQmtDiagnosticController } from './experimental-qmt-diagnostic.controller';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

describe('ExperimentalQmtDiagnosticController', () => {
  const store = new InMemoryQmtRealtimeStore();
  const controller = new ExperimentalQmtDiagnosticController(store, {
    entriesList: [],
  } as never);
  const requestFrom = (ip: string) =>
    ({ ip, socket: { remoteAddress: ip } }) as unknown as Request;

  it.each(['127.0.0.1', '127.9.8.7', '::1', '::ffff:127.0.0.1'])(
    'allows loopback %s',
    (ip) => {
      expect(() => controller.getStatus(requestFrom(ip))).not.toThrow();
    },
  );

  it.each(['10.0.0.1', '::ffff:10.0.0.1', 'evil-127.example'])(
    'rejects remote %s',
    (ip) => {
      expect(() => controller.getStatus(requestFrom(ip))).toThrow(
        ForbiddenException,
      );
    },
  );
});
