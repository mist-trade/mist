import { Security, SecuritySourceConfig } from '@app/shared-data';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentalQmtAllowlistResolver } from './experimental-qmt-allowlist.resolver';
import { ExperimentalQmtDiagnosticController } from './experimental-qmt-diagnostic.controller';
import { ExperimentalQmtRealtimeClient } from './experimental-qmt-realtime.client';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';

@Module({
  imports: [TypeOrmModule.forFeature([Security, SecuritySourceConfig])],
  providers: [
    ExperimentalQmtAllowlistResolver,
    ExperimentalQmtRealtimeClient,
    InMemoryQmtRealtimeStore,
  ],
  controllers: [ExperimentalQmtDiagnosticController],
})
export class ExperimentalQmtRealtimeModule {}
