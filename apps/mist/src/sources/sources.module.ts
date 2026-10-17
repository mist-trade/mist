import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecuritySourceConfig } from '@app/shared-data';
import { DataSourceService } from './services/data-source.service';
import { DataSourceSelectionService } from './services/data-source-selection.service';
import { PeriodMappingService } from './services/period-mapping.service';
import { KBoundaryCalculator } from './services/k-boundary-calculator';

@Module({
  imports: [TypeOrmModule.forFeature([SecuritySourceConfig])],
  providers: [
    DataSourceService,
    DataSourceSelectionService,
    PeriodMappingService,
    KBoundaryCalculator,
  ],
  exports: [
    DataSourceService,
    DataSourceSelectionService,
    PeriodMappingService,
    KBoundaryCalculator,
  ],
})
export class SourcesModule {}
