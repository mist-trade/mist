import { RealtimeSymbolSequenceFence } from './realtime-symbol-sequence-fence';

describe('RealtimeSymbolSequenceFence', () => {
  it('fences independently per symbol and rejects duplicate/out-of-order frames', () => {
    const fence = new RealtimeSymbolSequenceFence();
    fence.beginEpoch('epoch-1');

    expect(fence.accept('600030.SH', 'epoch-1', 2)).toEqual({ accepted: true });
    expect(fence.accept('300502.SZ', 'epoch-1', 1)).toEqual({ accepted: true });
    expect(fence.accept('600030.SH', 'epoch-1', 2)).toEqual({
      accepted: false,
      reason: 'duplicate',
    });
    expect(fence.accept('600030.SH', 'epoch-1', 1)).toEqual({
      accepted: false,
      reason: 'outOfOrder',
    });
  });

  it('rejects retired epochs and resets sequences only when the epoch changes', () => {
    const fence = new RealtimeSymbolSequenceFence();
    fence.beginEpoch('epoch-1');
    expect(fence.accept('600030.SH', 'epoch-1', 1).accepted).toBe(true);
    expect(fence.beginEpoch('epoch-1')).toBe(false);
    expect(fence.accept('600030.SH', 'epoch-1', 1)).toMatchObject({
      reason: 'duplicate',
    });
    expect(fence.beginEpoch('epoch-2')).toBe(true);
    expect(fence.accept('600030.SH', 'epoch-1', 2)).toMatchObject({
      reason: 'epochMismatch',
    });
    expect(fence.accept('600030.SH', 'epoch-2', 1).accepted).toBe(true);
  });
});
