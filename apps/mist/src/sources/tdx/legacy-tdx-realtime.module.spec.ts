import { MODULE_METADATA } from '@nestjs/common/constants';
import { TimezoneModule } from '@app/timezone';
import { UtilsModule } from '@app/utils';
import { HistoricalCollectorModule } from '../../collector/historical-collector.module';
import { SecurityModule } from '../../security/security.module';
import { LegacyTdxRealtimeModule } from './legacy-tdx-realtime.module';

describe('LegacyTdxRealtimeModule dependency graph', () => {
  it('imports the modules that provide its controller and provider dependencies', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      LegacyTdxRealtimeModule,
    ) as unknown[];

    expect(imports).toEqual(
      expect.arrayContaining([
        HistoricalCollectorModule,
        SecurityModule,
        TimezoneModule,
        UtilsModule,
      ]),
    );
  });
});
