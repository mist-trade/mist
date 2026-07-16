/**
 * ExperimentalTdxDiagnosticController — internal diagnostic readback.
 *
 * Only mounted when TDX_REALTIME_MODE=builtin_experimental. NOT a product API.
 * Returns typed snapshot, epoch, sequence, receivedAt, fresh/stale, drop
 * reasons, counters, owner, latest age, active symbols.
 */
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';

@ApiTags('experimental-tdx-realtime')
@Controller('internal/experimental/tdx/realtime')
export class ExperimentalTdxDiagnosticController {
  constructor(
    private readonly store: InMemoryRealtimeStore,
    private readonly allowlist: ExperimentalAllowlistResolver,
  ) {}

  @Get('status')
  getStatus() {
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
  getSymbol(@Param('formatCode') formatCode: string) {
    const debug = this.store.readDebug(formatCode);
    if (!debug) {
      throw new NotFoundException(`no experimental snapshot for ${formatCode}`);
    }
    return debug;
  }
}
