import { SignalPreMarketWarmupService } from './signal-pre-market-warmup.service';
import { SignalRuntimeMutex } from '../signal-runtime-mutex.service';

describe('SignalPreMarketWarmupService', () => {
  it('guards warmupRealtimeWindows under SignalRuntimeMutex so it cannot race with incoming triggers', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const runtimeMutex = new SignalRuntimeMutex();
    const registry = {
      capture: jest.fn().mockReturnValue({
        definitions: new Map([
          [
            1,
            {
              sources: ['tdx'],
              securityIds: new Set([9]),
            },
          ],
        ]),
      }),
      executionPlansFor: jest.fn().mockReturnValue([{ definitionId: 1 }]),
    };
    const processor = {
      warmupRealtimeWindows: jest.fn(async () => {
        events.push('warmup:start');
        await firstGate;
        events.push('warmup:end');
        return {
          total: 1,
          succeeded: 1,
          skipped: 0,
          failed: 0,
          failedTargets: [],
        };
      }),
    };
    const timezoneService = {
      isTradingDay: jest.fn().mockResolvedValue(true),
    };
    const healthState = {
      recordPreMarketWarmup: jest.fn(),
    };

    const service = new SignalPreMarketWarmupService(
      registry as never,
      processor as never,
      timezoneService as never,
      healthState as never,
      runtimeMutex,
    );

    const warmupPromise = service.handlePreMarketWarmup();
    await new Promise((resolve) => setImmediate(resolve));
    const triggerPromise = runtimeMutex.run(async () => {
      events.push('trigger:ran');
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['warmup:start']);

    releaseFirst();
    await Promise.all([warmupPromise, triggerPromise]);

    expect(events).toEqual(['warmup:start', 'warmup:end', 'trigger:ran']);
    expect(healthState.recordPreMarketWarmup).toHaveBeenCalledTimes(1);
  });

  it('skips acquiring mutex when non-trading day or no active targets', async () => {
    const runtimeMutex = { run: jest.fn() };
    const processor = { warmupRealtimeWindows: jest.fn() };
    const service = new SignalPreMarketWarmupService(
      { capture: jest.fn(() => ({ definitions: new Map() })) } as never,
      processor as never,
      { isTradingDay: jest.fn().mockResolvedValue(false) } as never,
      { recordPreMarketWarmup: jest.fn() } as never,
      runtimeMutex as never,
    );

    await service.handlePreMarketWarmup();
    expect(runtimeMutex.run).not.toHaveBeenCalled();
    expect(processor.warmupRealtimeWindows).not.toHaveBeenCalled();
  });
});
