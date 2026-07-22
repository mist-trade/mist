import { Module } from '@nestjs/common';
import { QmtRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { QmtRealtimeDiagnosticController } from './realtime-diagnostic.controller';
import { QmtRealtimeClient } from './realtime.client';
import { QmtRealtimeStore } from './realtime.store';
import { RealtimeIngressModule } from '../../../realtime/realtime-ingress.module';

@Module({
  imports: [RealtimeIngressModule],
  providers: [
    QmtRealtimeAllowlistResolver,
    QmtRealtimeClient,
    QmtRealtimeStore,
  ],
  controllers: [QmtRealtimeDiagnosticController],
})
export class QmtRealtimeModule {}
