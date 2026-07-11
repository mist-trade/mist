import {
  BacktestRun,
  BacktestSignal,
  BacktestOrder,
  BacktestTrade,
  BacktestEquityPoint,
  Security,
  K,
  SecuritySourceConfig,
  StrategyAlertEvent,
  StrategyDefinition,
  StrategySignal,
  StrategyVersion,
} from '@app/shared-data';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { scheduleEnvSchema } from '@app/config';
import { DataCollectionController } from './data-collection.controller';
import { CollectorModule } from '../../mist/src/collector/collector.module';
import { StrategyCoreModule } from '../../mist/src/strategy/strategy-core.module';
import { TimezoneModule } from '@app/timezone';
import * as path from 'path';

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
      validationSchema: scheduleEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
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
            Security,
            K,
            SecuritySourceConfig,
            StrategyDefinition,
            StrategyVersion,
            StrategySignal,
            StrategyAlertEvent,
            BacktestRun,
            BacktestSignal,
            BacktestOrder,
            BacktestTrade,
            BacktestEquityPoint,
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
    NestScheduleModule.forRoot(),
    CollectorModule,
    StrategyCoreModule,
    TimezoneModule,
  ],
  controllers: [DataCollectionController],
  providers: [],
})
export class ScheduleModule {}
