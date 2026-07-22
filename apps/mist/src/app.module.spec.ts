import {
  qmtRealtimeModulesForMode,
  tdxRealtimeModulesForMode,
} from './app.module';
import { QmtRealtimeModule } from './sources/qmt/realtime/qmt-realtime.module';
import { TdxRealtimeModule } from './sources/tdx/realtime/tdx-realtime.module';

describe('TDX realtime mode module matrix', () => {
  it('is builtin by default', () => {
    expect(tdxRealtimeModulesForMode(undefined)).toEqual([TdxRealtimeModule]);
  });

  it('can be explicitly disabled for rollback', () => {
    expect(tdxRealtimeModulesForMode('off')).toEqual([]);
  });

  it('fails closed for an unknown TDX mode', () => {
    expect(() => tdxRealtimeModulesForMode('legacy')).toThrow(
      'Unsupported TDX_REALTIME_MODE',
    );
  });
});

describe('QMT realtime mode module matrix', () => {
  it('is builtin by default', () => {
    expect(qmtRealtimeModulesForMode(undefined)).toEqual([QmtRealtimeModule]);
  });

  it('imports the formal QMT realtime module when enabled', () => {
    expect(qmtRealtimeModulesForMode('builtin')).toEqual([QmtRealtimeModule]);
  });

  it('can be explicitly disabled for rollback', () => {
    expect(qmtRealtimeModulesForMode('off')).toEqual([]);
  });

  it('fails closed for an unknown QMT mode', () => {
    expect(() => qmtRealtimeModulesForMode('legacy')).toThrow(
      'Unsupported QMT_REALTIME_MODE',
    );
  });
});
