import { Module } from '@nestjs/common';
import { QmtRealtimeAllowlistResolver } from './qmt-realtime-allowlist.resolver';
import { QmtRealtimeDiagnosticController } from './qmt-realtime-diagnostic.controller';
import { QmtRealtimeClient } from './qmt-realtime.client';
import { InMemoryQmtRealtimeStore } from './in-memory-qmt-realtime.store';
import { RealtimeIngressModule } from '../../../realtime/realtime-ingress.module';

@Module({
  imports: [RealtimeIngressModule],
  providers: [
    QmtRealtimeAllowlistResolver,
    QmtRealtimeClient,
    InMemoryQmtRealtimeStore,
  ],
  controllers: [QmtRealtimeDiagnosticController],
})
export class QmtRealtimeModule {}
