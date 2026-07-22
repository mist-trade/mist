import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecuritySourceConfig } from '@app/shared-data';
import { RealtimeSnapshotIngressService } from './realtime-snapshot-ingress.service';
import { RealtimeSecurityAllowlistService } from './realtime-security-allowlist.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SecuritySourceConfig])],
  providers: [RealtimeSnapshotIngressService, RealtimeSecurityAllowlistService],
  exports: [RealtimeSnapshotIngressService, RealtimeSecurityAllowlistService],
})
export class RealtimeIngressModule {}
