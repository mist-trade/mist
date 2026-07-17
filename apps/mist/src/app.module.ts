import {
  K,
  KExtensionEf,
  KExtensionTdx,
  KExtensionQmt,
  Security,
  SecuritySourceConfig,
  StrategyDefinition,
  StrategyVersion,
  StrategySignal,
  StrategyAlertEvent,
  BacktestRun,
  BacktestSignalResult,
} from '@app/shared-data';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChanModule } from './chan/chan.module';
import { HistoricalCollectorModule } from './collector/historical-collector.module';
import { LegacyTdxRealtimeModule } from './sources/tdx/legacy-tdx-realtime.module';
import { ExperimentalTdxRealtimeModule } from './sources/tdx/experimental/experimental-tdx-realtime.module';
import { IndicatorModule } from './indicator/indicator.module';
import { SecurityModule } from './security/security.module';
import { mistEnvSchema } from '@app/config';
import { StrategyModule } from './strategy/strategy.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(
          process.cwd(),
          `.env.${process.env.NODE_ENV || 'development'}`,
        ),
        path.resolve(process.cwd(), '.env'),
      ],
      validationSchema: mistEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // Time window in milliseconds (1 minute)
        limit: 100, // Maximum number of requests within the ttl window
      },
    ]),
    TypeOrmModule.forRootAsync({
      useFactory(configService: ConfigService) {
        return {
          type: 'mysql',
          host: configService.get('mysql_server_host'),
          port: configService.get('mysql_server_port'),
          username: configService.get('mysql_server_username'),
          password: configService.get('mysql_server_password'),
          database: configService.get('mysql_server_database'),
          synchronize: false,
          logging: configService.get('NODE_ENV') !== 'production',
          entities: [
            K,
            KExtensionEf,
            KExtensionTdx,
            KExtensionQmt,
            Security,
            SecuritySourceConfig,
            StrategyDefinition,
            StrategyVersion,
            StrategySignal,
            StrategyAlertEvent,
            BacktestRun,
            BacktestSignalResult,
          ],
          poolSize: 10,
          connectorPackage: 'mysql2',
          extra: {
            authPlugins: 'sha256_password',
          },
        };
      },
      inject: [ConfigService],
    }),
    ...realtimeModulesForMode(process.env.TDX_REALTIME_MODE),
    IndicatorModule,
    SecurityModule,
    ChanModule,
    StrategyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

/**
 * Returns the realtime modules to import based on TDX_REALTIME_MODE.
 * - legacy (default): Historical + Legacy realtime
 * - builtin_experimental: Historical + Experimental realtime
 * - off: Historical only
 */
export function realtimeModulesForMode(mode: string | undefined) {
  const normalized = (mode ?? 'legacy').trim().toLowerCase();
  if (normalized === 'builtin_experimental') {
    return [HistoricalCollectorModule, ExperimentalTdxRealtimeModule];
  }
  if (normalized === 'off') {
    return [HistoricalCollectorModule];
  }
  if (normalized === 'legacy') {
    return [HistoricalCollectorModule, LegacyTdxRealtimeModule];
  }
  throw new Error(
    `Unsupported TDX_REALTIME_MODE=${JSON.stringify(mode)}; expected legacy, builtin_experimental, or off`,
  );
}
