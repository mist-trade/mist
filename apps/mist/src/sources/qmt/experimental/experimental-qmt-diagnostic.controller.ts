import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { isIP } from 'node:net';
import { ExperimentalQmtAllowlistResolver } from './experimental-qmt-allowlist.resolver';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

@ApiTags('experimental-qmt-realtime')
@Controller('internal/experimental/qmt/realtime')
export class ExperimentalQmtDiagnosticController {
  constructor(
    private readonly store: InMemoryQmtRealtimeStore,
    private readonly allowlist: ExperimentalQmtAllowlistResolver,
  ) {}

  @Get('status')
  getStatus(@Req() request: Request) {
    requireLoopback(request);
    return {
      ...this.store.status(),
      allowlist: this.allowlist.entriesList,
    };
  }

  @Get(':formatCode')
  getSymbol(@Param('formatCode') formatCode: string, @Req() request: Request) {
    requireLoopback(request);
    const value = this.store.read(formatCode);
    if (!value) {
      throw new NotFoundException(`no experimental snapshot for ${formatCode}`);
    }
    return value;
  }
}

function requireLoopback(request: Request): void {
  const ip = request.ip ?? request.socket.remoteAddress ?? '';
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const loopback =
    normalized === 'localhost' ||
    normalized === '::1' ||
    (isIP(normalized) === 4 && normalized.startsWith('127.'));
  if (!loopback) {
    throw new ForbiddenException('diagnostic endpoints are loopback-only');
  }
}
