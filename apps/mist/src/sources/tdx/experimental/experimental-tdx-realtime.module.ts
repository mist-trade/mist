/**
 * ExperimentalTdxRealtimeModule — experimental TDX realtime consumer.
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
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';
import { ExperimentalTdxRealtimeClient } from './experimental-tdx-realtime.client';
import { ExperimentalTdxDiagnosticController } from './experimental-diagnostic.controller';

@Module({
  // Only Security + SecuritySourceConfig for the allowlist resolver.
  // Deliberately does NOT import K / KExtension* / HistoricalCollectorModule.
  imports: [TypeOrmModule.forFeature([Security, SecuritySourceConfig])],
  providers: [
    InMemoryRealtimeStore,
    ExperimentalAllowlistResolver,
    ExperimentalTdxRealtimeClient,
  ],
  controllers: [ExperimentalTdxDiagnosticController],
})
export class ExperimentalTdxRealtimeModule {}
