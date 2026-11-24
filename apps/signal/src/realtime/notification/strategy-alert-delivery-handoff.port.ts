import type { AlertDeliveryGroupDescriptor } from '@app/contracts';

/**
 * Port for enqueueing proactive strategy alert delivery (deliver-strategy-notifications).
 * The producer (apps/signal LiveStrategyPersistenceService) calls publishGroup() after
 * the batch commit with one (securityId, effectiveTime) group — the group is complete
 * at commit time because every same-effectiveTime signal originates from the same
 * candle_finalized trigger batch. Failures are best-effort (Signals already committed;
 * events stay PENDING for the pending-alert sweep).
 */
export const STRATEGY_ALERT_DELIVERY_HANDOFF_PORT = Symbol(
  'STRATEGY_ALERT_DELIVERY_HANDOFF_PORT',
);

export interface StrategyAlertDeliveryHandoffPort {
  publishGroup(
    group: AlertDeliveryGroupDescriptor,
    alertEventIds: readonly number[],
  ): Promise<void>;
}
