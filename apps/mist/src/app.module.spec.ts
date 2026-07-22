import { qmtRealtimeModulesForMode } from './app.module';
import { QmtRealtimeModule } from './sources/qmt/realtime/qmt-realtime.module';

describe('QMT realtime mode module matrix', () => {
  it('is builtin by default', () => {
    expect(qmtRealtimeModulesForMode(undefined)).toEqual([QmtRealtimeModule]);
  });

  it('imports the formal QMT realtime module when enabled', () => {
    expect(qmtRealtimeModulesForMode('builtin')).toEqual([QmtRealtimeModule]);
  });

  it('fails closed for an unknown QMT mode', () => {
    expect(() => qmtRealtimeModulesForMode('legacy')).toThrow(
      'Unsupported QMT_REALTIME_MODE',
    );
  });
});
