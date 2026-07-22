/**
 * TdxRealtimeDiagnosticController — internal diagnostic readback.
 *
 * Mounted when TDX_REALTIME_MODE=builtin. NOT a product API.
 * Loopback/admin only: rejects non-loopback connections.
 * Returns typed snapshot, epoch, sequence, receivedAt, fresh/stale, drop
 * reasons, counters, owner, latest age, active symbols.
 */
import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { requireRealtimeDiagnosticLoopback } from '../../../realtime/realtime-diagnostic.guard';
import { TdxRealtimeStore } from './realtime.store';
import { TdxRealtimeAllowlistResolver } from './realtime-allowlist.resolver';

@ApiTags('tdx-realtime')
@Controller('internal/realtime/tdx')
export class TdxRealtimeDiagnosticController {
  constructor(
    private readonly store: TdxRealtimeStore,
    private readonly allowlist: TdxRealtimeAllowlistResolver,
  ) {}

  @Get('status')
  getStatus(@Req() req: Request) {
    requireRealtimeDiagnosticLoopback(req);
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
    requireRealtimeDiagnosticLoopback(req);
    const debug = this.store.readDebug(formatCode);
    if (!debug) {
      throw new NotFoundException(`no realtime snapshot for ${formatCode}`);
    }
    return debug;
  }
}
