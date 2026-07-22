import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { requireRealtimeDiagnosticLoopback } from '../../../realtime/realtime-diagnostic.guard';
import { QmtRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { QmtRealtimeStore } from './realtime.store';

@ApiTags('qmt-realtime')
@Controller('internal/realtime/qmt')
export class QmtRealtimeDiagnosticController {
  constructor(
    private readonly store: QmtRealtimeStore,
    private readonly allowlist: QmtRealtimeAllowlistResolver,
  ) {}

  @Get('status')
  getStatus(@Req() request: Request) {
    requireRealtimeDiagnosticLoopback(request);
    return {
      ...this.store.status(),
      allowlist: this.allowlist.entriesList,
    };
  }

  @Get(':formatCode')
  getSymbol(@Param('formatCode') formatCode: string, @Req() request: Request) {
    requireRealtimeDiagnosticLoopback(request);
    const value = this.store.read(formatCode);
    if (!value) {
      throw new NotFoundException(`no realtime snapshot for ${formatCode}`);
    }
    return value;
  }
}
