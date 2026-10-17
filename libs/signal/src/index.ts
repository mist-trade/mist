export * from '@app/contracts';

export {
  REALTIME_STRATEGY_PERIODS,
  RealtimePeriodBuilder,
  RealtimeKernelPool,
  type RealtimeStrategyPeriod,
  type RealtimeLastOutcome,
  type RealtimeStrategyExecutionPlan,
  type RealtimeWindowGroupIdentity,
} from '@app/strategy';

export { RealtimeStrategyEvaluationService } from './runtime/realtime-strategy-evaluation.service';
export type { ShadowStrategyCandidate } from './runtime/realtime-strategy-evaluation.service';
