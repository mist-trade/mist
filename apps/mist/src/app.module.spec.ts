import { realtimeModulesForMode } from './app.module';
import { HistoricalCollectorModule } from './collector/historical-collector.module';
import { LegacyTdxRealtimeModule } from './sources/tdx/legacy-tdx-realtime.module';
import { ExperimentalTdxRealtimeModule } from './sources/tdx/experimental/experimental-tdx-realtime.module';

describe('TDX realtime mode module matrix', () => {
  it('uses legacy realtime by default', () => {
    expect(realtimeModulesForMode(undefined)).toEqual([
      HistoricalCollectorModule,
      LegacyTdxRealtimeModule,
    ]);
  });

  it('isolates builtin experimental realtime from the legacy module', () => {
    const modules = realtimeModulesForMode('builtin_experimental');
    expect(modules).toEqual([
      HistoricalCollectorModule,
      ExperimentalTdxRealtimeModule,
    ]);
    expect(modules).not.toContain(LegacyTdxRealtimeModule);
  });

  it('disables both realtime modules in off mode', () => {
    expect(realtimeModulesForMode('off')).toEqual([HistoricalCollectorModule]);
  });

  it('fails closed for an unknown mode', () => {
    expect(() => realtimeModulesForMode('typo')).toThrow(
      'Unsupported TDX_REALTIME_MODE',
    );
  });
});
