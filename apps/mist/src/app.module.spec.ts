import { qmtRealtimeModulesForMode } from './app.module';
import { ExperimentalQmtRealtimeModule } from './sources/qmt/experimental/experimental-qmt-realtime.module';

describe('QMT realtime mode module matrix', () => {
  it('is off by default', () => {
    expect(qmtRealtimeModulesForMode(undefined)).toEqual([]);
  });

  it('imports only the independent QMT experimental module when enabled', () => {
    expect(qmtRealtimeModulesForMode('builtin_experimental')).toEqual([
      ExperimentalQmtRealtimeModule,
    ]);
  });

  it('fails closed for an unknown QMT mode', () => {
    expect(() => qmtRealtimeModulesForMode('legacy')).toThrow(
      'Unsupported QMT_REALTIME_MODE',
    );
  });
});
