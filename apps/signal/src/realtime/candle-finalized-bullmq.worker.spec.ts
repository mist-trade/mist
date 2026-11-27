import { CANDLE_FINALIZED_JOB_NAME } from '@app/contracts';
import { CandleFinalizedBullMqWorker } from './candle-finalized-bullmq.worker';
import { SignalRuntimeMutex } from '../signal-runtime-mutex.service';

describe('CandleFinalizedBullMqWorker', () => {
  it('delegates the BullMQ job to the strict signal processor', async () => {
    const result = { outcome: 'completed', candidates: [] } as const;
    const processor = {
      process: jest.fn().mockResolvedValue(result),
      diagnostics: jest.fn().mockReturnValue({
        groupCount: 1,
        rawBarCount: 1,
        derivedBarCount: 0,
        activeEpisodeCount: 0,
        lastOutcome: 'evaluated_not_matched',
        lastPersistenceOutcome: null,
        acceptedTriggerTime: '2026-08-04T06:44:00.000Z',
        evaluationStarted: true,
        evaluated: true,
      }),
    };
    const health = {
      recordJobStarted: jest.fn(),
      recordJobSucceeded: jest.fn(),
      recordJobFailed: jest.fn(),
    };
    const worker = new CandleFinalizedBullMqWorker(
      processor as never,
      new SignalRuntimeMutex(),
      health as never,
    );
    const data = {
      contractVersion: 1,
      securityId: 9,
      source: 'tdx',
      period: '1m',
      triggerTime: '2026-08-04T06:44:00.000Z',
      outcome: 'sealed',
      triggerPrice: 28,
    } as const;

    await expect(
      worker.process({ name: CANDLE_FINALIZED_JOB_NAME, data } as never),
    ).resolves.toBe(result);
    expect(processor.process).toHaveBeenCalledWith(
      CANDLE_FINALIZED_JOB_NAME,
      data,
    );
    expect(health.recordJobStarted).toHaveBeenCalledTimes(1);
    expect(health.recordJobSucceeded).toHaveBeenCalledTimes(1);
  });

  it('captures processor diagnostics inside runtimeMutex before a queued job overwrites them', async () => {
    const activeDiag = {
      groupCount: 1,
      rawBarCount: 1,
      derivedBarCount: 0,
      lastOutcome: 'evaluated_matched' as const,
      lastPersistenceOutcome: 'created' as const,
      acceptedTriggerTime: '2026-08-04T06:44:00.000Z',
      evaluationStarted: true,
      evaluated: true,
    };
    const events: string[] = [];
    const runtimeMutex = new SignalRuntimeMutex();
    const originalRun = runtimeMutex.run.bind(runtimeMutex);
    jest.spyOn(runtimeMutex, 'run').mockImplementation(async (operation) => {
      return originalRun(async () => {
        events.push('mutex:enter');
        try {
          return await operation();
        } finally {
          events.push('mutex:exit');
        }
      });
    });

    const processor = {
      process: jest.fn().mockImplementation(async () => {
        events.push('processor:process');
        return { outcome: 'completed', candidates: [] };
      }),
      diagnostics: jest.fn(() => {
        events.push('processor:diagnostics');
        return activeDiag;
      }),
    };
    const health = {
      recordJobStarted: jest.fn(),
      recordJobSucceeded: jest.fn(),
      recordJobFailed: jest.fn(),
    };
    const worker = new CandleFinalizedBullMqWorker(
      processor as never,
      runtimeMutex,
      health as never,
    );

    await worker.process({
      name: CANDLE_FINALIZED_JOB_NAME,
      data: {},
    } as never);

    expect(events).toEqual([
      'mutex:enter',
      'processor:process',
      'processor:diagnostics',
      'mutex:exit',
    ]);
    expect(health.recordJobSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedTriggerTime: '2026-08-04T06:44:00.000Z',
      }),
    );
  });
});
