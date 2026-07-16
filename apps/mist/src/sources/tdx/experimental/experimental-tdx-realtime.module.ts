/**
 * ExperimentalTdxRealtimeModule — experimental TDX realtime consumer.
 *
 * Only imported by the mist app when TDX_REALTIME_MODE=builtin_experimental.
 * Contains the independent WS client, allowlist resolver, in-memory store, and
 * diagnostic controller.
 *
 * Architecture constraint (no-K safety gate): this module MUST NOT import
 * CollectorService, KCandleAggregator, K repository, or StrategyScanService.
 * It stores latest snapshots only — no K aggregation, no DB writes, no business
 * side effects.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Security, SecuritySourceConfig } from '@app/shared-data';
import { HistoricalCollectorModule } from '../../../collector/historical-collector.module';
import { InMemoryRealtimeStore } from './in-memory-realtime.store';
import { ExperimentalAllowlistResolver } from './experimental-allowlist.resolver';
import { ExperimentalTdxRealtimeClient } from './experimental-tdx-realtime.client';
import { ExperimentalTdxDiagnosticController } from './experimental-diagnostic.controller';

@Module({
  // SecuritySourceConfig + Security for the allowlist resolver's BINARY exact query.
  // Deliberately does NOT import K / KExtension* — no K writes.
  imports: [
    HistoricalCollectorModule,
    TypeOrmModule.forFeature([Security, SecuritySourceConfig]),
  ],
  providers: [
    InMemoryRealtimeStore,
    ExperimentalAllowlistResolver,
    ExperimentalTdxRealtimeClient,
  ],
  controllers: [ExperimentalTdxDiagnosticController],
})
export class ExperimentalTdxRealtimeModule {}
