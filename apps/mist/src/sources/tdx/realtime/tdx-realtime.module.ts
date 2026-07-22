/**
 * TdxRealtimeModule — formal TDX realtime consumer.
 *
 * Always imported by the mist app. QMT retains its independent mode switch.
 * Contains the independent WS client, allowlist resolver, in-memory store, and
 * diagnostic controller.
 *
 * no-K static boundary: this module deliberately does NOT import
 * HistoricalCollectorModule (which carries K repositories and CollectorService).
 * It only imports Security/SecuritySourceConfig for the allowlist resolver.
 * No K aggregation, no DB K writes, no business side effects.
 */
import { Module } from '@nestjs/common';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { RealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { TdxRealtimeClient } from './tdx-realtime.client';
import { TdxRealtimeDiagnosticController } from './realtime-diagnostic.controller';
import { RealtimeIngressModule } from '../../../realtime/realtime-ingress.module';

@Module({
  // Only SecuritySourceConfig for the allowlist resolver.
  // Deliberately does NOT import K / KExtension* / HistoricalCollectorModule.
  imports: [RealtimeIngressModule],
  providers: [
    InMemoryRealtimeStore,
    RealtimeAllowlistResolver,
    TdxRealtimeClient,
  ],
  controllers: [TdxRealtimeDiagnosticController],
})
export class TdxRealtimeModule {}
