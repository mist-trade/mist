/**
 * TdxRealtimeDiagnosticController — internal diagnostic readback.
 *
 * Mounted with the always-on builtin TDX realtime module. NOT a product API.
 * Loopback/admin only: rejects non-loopback connections.
 * Returns typed snapshot, epoch, sequence, receivedAt, fresh/stale, drop
 * reasons, counters, owner, latest age, active symbols.
 */
import {
  Controller,
  Get,
  Param,
  NotFoundException,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { isIP } from 'node:net';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { RealtimeAllowlistResolver } from './realtime-allowlist.resolver';

@ApiTags('tdx-realtime')
@Controller('internal/realtime/tdx')
export class TdxRealtimeDiagnosticController {
  constructor(
    private readonly store: InMemoryRealtimeStore,
    private readonly allowlist: RealtimeAllowlistResolver,
  ) {}

  /** Reject non-loopback requests. */
  private requireLoopback(req: Request): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const loopback =
      normalized === 'localhost' ||
      normalized === '::1' ||
      (isIP(normalized) === 4 && normalized.split('.')[0] === '127');
    if (!loopback) {
      throw new ForbiddenException('diagnostic endpoints are loopback-only');
    }
  }

  @Get('status')
  getStatus(@Req() req: Request) {
    this.requireLoopback(req);
    const runtime = this.store.getRuntimeMetadata();
    return {
      mode: 'builtin',
      connected: this.store.isConnected,
      ready: runtime.ready,
      ownerId: runtime.ownerId,
      datasourceBuildId: runtime.datasourceBuildId,
      bridgeBuildId: runtime.bridgeBuildId,
      currentGeneration: runtime.currentGeneration,
      currentStreamEpoch: this.store.currentStreamEpoch,
      activeSymbolCount: this.store.activeSymbolCount,
      activeSymbols: this.store.getActiveSymbols(),
      allowlist: this.allowlist.entriesList.map((e) => ({
        formatCode: e.formatCode,
        securityId: e.securityId,
      })),
      dropCounts: this.store.getAllDropCounts(),
      lastDrop: this.store.getLastDrop(),
      lastError: runtime.lastError,
    };
  }

  @Get(':formatCode')
  getSymbol(@Param('formatCode') formatCode: string, @Req() req: Request) {
    this.requireLoopback(req);
    const debug = this.store.readDebug(formatCode);
    if (!debug) {
      throw new NotFoundException(`no realtime snapshot for ${formatCode}`);
    }
    return debug;
  }
}
