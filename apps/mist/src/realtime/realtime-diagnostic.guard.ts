import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { isIP } from 'node:net';

export function requireRealtimeDiagnosticLoopback(request: Request): void {
  const ip = request.ip ?? request.socket.remoteAddress ?? '';
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const loopback =
    normalized === 'localhost' ||
    normalized === '::1' ||
    (isIP(normalized) === 4 && normalized.split('.')[0] === '127');
  if (!loopback) {
    throw new ForbiddenException('diagnostic endpoints are loopback-only');
  }
}
