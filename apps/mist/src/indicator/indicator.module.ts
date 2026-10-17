import { K, Security } from '@app/shared-data';
import { Module } from '@nestjs/common';
import { TimezoneModule } from '@app/timezone';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourcesModule } from '../sources/sources.module';
import { IndicatorController } from './indicator.controller';
import { IndicatorService } from './indicator.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([K, Security]),
    SourcesModule,
    TimezoneModule,
  ],
  providers: [IndicatorService],
  exports: [IndicatorService],
})
export class IndicatorModule {}

@Module({
  imports: [IndicatorModule, TimezoneModule],
  controllers: [IndicatorController],
})
export class IndicatorHttpModule {}
