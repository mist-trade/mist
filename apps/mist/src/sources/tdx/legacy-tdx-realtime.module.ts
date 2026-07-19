/**
 * LegacyTdxRealtimeModule — legacy TDX realtime path.
 *
 * Contains the existing TdxWebSocketService, KCandleAggregator,
 * WebSocketCollectionStrategy, and the legacy streaming test controller.
 * Only imported by the mist app when TDX_REALTIME_MODE=legacy (default).
 *
 * Imports HistoricalCollectorModule to obtain CollectorService.
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from '@app/shared-data';
import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils';
import { HistoricalCollectorModule } from '../../collector/historical-collector.module';
import { CollectorService } from '../../collector/collector.service';
import { WebSocketCollectionStrategy } from '../../collector/strategies/websocket-collection.strategy';
import { SecurityModule } from '../../security/security.module';
import { TdxWebSocketService } from './tdx-websocket.service';
import { KCandleAggregator } from './kcandle-aggregator';
import { LegacyTdxStreamingController } from './legacy-tdx-streaming.controller';

@Module({
  imports: [
    HistoricalCollectorModule,
    SecurityModule,
    TimezoneModule,
    UtilsModule,
  ],
  providers: [
    KCandleAggregator,
    TdxWebSocketService,
    {
      provide: WebSocketCollectionStrategy,
      useFactory: (
        collectorService: CollectorService,
        configService: ConfigService,
        tdxWebSocketService: TdxWebSocketService,
      ) =>
        new WebSocketCollectionStrategy(
          DataSource.TDX,
          collectorService,
          configService,
          new Logger(WebSocketCollectionStrategy.name),
          tdxWebSocketService,
        ),
      inject: [CollectorService, ConfigService, TdxWebSocketService],
    },
  ],
  controllers: [LegacyTdxStreamingController],
})
export class LegacyTdxRealtimeModule {}
