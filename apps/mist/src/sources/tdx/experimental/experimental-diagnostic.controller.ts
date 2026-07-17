/**
 * ExperimentalTdxDiagnosticController — internal diagnostic readback.
 *
 * Only mounted when TDX_REALTIME_MODE=builtin_experimental. NOT a product API.
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
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';

@ApiTags('experimental-tdx-realtime')
@Controller('internal/experimental/tdx/realtime')
export class ExperimentalTdxDiagnosticController {
  constructor(
    private readonly store: InMemoryRealtimeStore,
    private readonly allowlist: ExperimentalAllowlistResolver,
  ) {}

  /** Reject non-loopback requests. */
  private requireLoopback(req: Request): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? '';
    if (
      !ip.includes('127.0.0.1') &&
      !ip.includes('::1') &&
      !ip.includes('localhost')
    ) {
      throw new ForbiddenException('diagnostic endpoints are loopback-only');
    }
  }

  @Get('status')
  getStatus(@Req() req: Request) {
    this.requireLoopback(req);
    return {
      mode: 'builtin_experimental',
      connected: this.store.isConnected,
      currentStreamEpoch: this.store.currentStreamEpoch,
      activeSymbolCount: this.store.activeSymbolCount,
      activeSymbols: this.store.getActiveSymbols(),
      allowlist: this.allowlist.entriesList.map((e) => ({
        formatCode: e.formatCode,
        securityId: e.securityId,
      })),
      dropCounts: this.store.getAllDropCounts(),
    };
  }

  @Get(':formatCode')
  getSymbol(@Param('formatCode') formatCode: string, @Req() req: Request) {
    this.requireLoopback(req);
    const debug = this.store.readDebug(formatCode);
    if (!debug) {
      throw new NotFoundException(`no experimental snapshot for ${formatCode}`);
    }
    return debug;
  }
}
