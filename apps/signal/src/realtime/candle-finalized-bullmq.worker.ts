import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  STRATEGY_TRIGGER_BULLMQ_PREFIX,
  STRATEGY_TRIGGER_QUEUE_NAME,
  STRATEGY_TRIGGER_WORKER_CONCURRENCY,
  type CandleFinalizedTriggerV1,
} from '@app/contracts';
import {
  CandleFinalizedJobProcessor,
  RealtimeStrategyJobDeadlineExceededError,
  type CandleFinalizedJobResult,
} from './candle-finalized-job.processor';
import { SignalRuntimeMutex } from '../signal-runtime-mutex.service';
import { HealthStateService } from '../health/health-state.service';

@Processor(STRATEGY_TRIGGER_QUEUE_NAME, {
  concurrency: STRATEGY_TRIGGER_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: STRATEGY_TRIGGER_BULLMQ_PREFIX,
})
export class CandleFinalizedBullMqWorker extends WorkerHost {
  constructor(
    private readonly processor: CandleFinalizedJobProcessor,
    private readonly runtimeMutex: SignalRuntimeMutex,
    private readonly healthState: HealthStateService,
  ) {
    super();
  }

  async process(
    job: Job<CandleFinalizedTriggerV1, CandleFinalizedJobResult, string>,
  ): Promise<CandleFinalizedJobResult> {
    this.healthState.recordJobStarted();
    let diagnostics:
      | ReturnType<CandleFinalizedJobProcessor['diagnostics']>
      | undefined;
    try {
      const result = await this.runtimeMutex.run(async () => {
        try {
          const processed = await this.processor.process(job.name, job.data);
          diagnostics = this.processor.diagnostics();
          return processed;
        } catch (error) {
          try {
            diagnostics = this.processor.diagnostics();
          } catch {
            // Preserve the original failure if diagnostics snapshot throws.
          }
          throw error;
        }
      });
      const snapshot = diagnostics ?? this.processor.diagnostics();
      this.healthState.recordJobSucceeded({
        acceptedAt: new Date().toISOString(),
        outcome: result.outcome,
        acceptedTriggerTime: snapshot.acceptedTriggerTime,
        evaluated: snapshot.evaluated,
        windowGroupCount: snapshot.groupCount,
        rawBarCount: snapshot.rawBarCount,
        derivedBarCount: snapshot.derivedBarCount,
        evaluationOutcome: snapshot.lastOutcome,
        persistenceOutcome: snapshot.lastPersistenceOutcome,
      });
      return result;
    } catch (error) {
      const snapshot = diagnostics ?? this.processor.diagnostics();
      this.healthState.recordJobFailed({
        failureCode: classifyJobFailure(error, snapshot),
        failedAt: new Date().toISOString(),
        acceptedTriggerTime: snapshot.acceptedTriggerTime,
        evaluationStarted: snapshot.evaluationStarted,
        windowGroupCount: snapshot.groupCount,
        rawBarCount: snapshot.rawBarCount,
        derivedBarCount: snapshot.derivedBarCount,
        persistenceOutcome: snapshot.lastPersistenceOutcome,
      });
      throw error;
    }
  }
}

function classifyJobFailure(
  error: unknown,
  diagnostics: ReturnType<CandleFinalizedJobProcessor['diagnostics']>,
): string {
  if (error instanceof RealtimeStrategyJobDeadlineExceededError) {
    return error.code;
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return 'INVALID_REALTIME_STRATEGY_JOB';
  }
  if (diagnostics.lastPersistenceOutcome === 'failed') {
    return 'LIVE_STRATEGY_PERSISTENCE_FAILED';
  }
  if (diagnostics.evaluationStarted) {
    return 'REALTIME_STRATEGY_EVALUATION_FAILED';
  }
  return 'REALTIME_MARKET_DATA_READ_FAILED';
}
