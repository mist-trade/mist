import type { RealtimeProductizationMode } from '@app/config';
import type { CandleFinalizerDiagnostics } from './candle-finalizer';
import type { RealtimeSource } from '../realtime.types';

export type RealtimeCandleProductMode = RealtimeProductizationMode;

export interface RealtimeCandleRuntimeObservation {
  mode: RealtimeCandleProductMode;
  graceMs: number;
  queue: {
    pendingGlobal: number;
    maximumPendingPerSeries: number;
    snapshotOverflowTotal: number;
    dueAdmissionOverflowTotal: number;
  };
  candle: {
    seriesCount: number;
    candidateCount: number;
    invalidCandidateCount: number;
    frozenCandidateCount: number;
    /** Skip counts with source+securityId attribution (aggregator layer,
     * four reasons; the other two are product-layer counters below). */
    skipTotals: Array<{
      source: RealtimeSource;
      securityId: number;
      reason:
        | 'out_of_session'
        | 'no_event_time'
        | 'duplicate_or_late'
        | 'not_aggregation_eligible';
      total: number;
    }>;
    sealedTotal: number;
    discardTotals: CandleFinalizerDiagnostics['discardTotals'];
    lateAfterGraceTotal: Array<{
      source: RealtimeSource;
      securityId: number;
      total: number;
    }>;
    candidateCapacityExceededTotal: Array<{
      source: RealtimeSource;
      securityId: number;
      total: number;
    }>;
    /** Frames accepted as price-only (either cumulative quantity absent). */
    quantityMissingFrameTotal: number;
    finalizationFailureTotal: number;
    finalizationHorizonExceededTotal: number;
    recordLimitBreachTotal: number;
    recoveryGapTotal: number;
    maxSealedRecordBytes: number;
    maxManifestBytes: number;
  };
  due: {
    scanFailureTotal: number;
    registrationFailureTotal: number;
  };
}
