import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { K, Security, RealtimeSubscriptionAssignment } from '@app/shared-data';
import { TimezoneModule } from '@app/timezone';

import { PreMarketInspectionController } from './pre-market-inspection.controller';
import { PreMarketInspectionService } from './pre-market-inspection.service';

@Module({
  imports: [
    TimezoneModule,
    TypeOrmModule.forFeature([K, Security, RealtimeSubscriptionAssignment]),
  ],
  controllers: [PreMarketInspectionController],
  providers: [PreMarketInspectionService],
  exports: [PreMarketInspectionService],
})
export class InspectionModule {}
