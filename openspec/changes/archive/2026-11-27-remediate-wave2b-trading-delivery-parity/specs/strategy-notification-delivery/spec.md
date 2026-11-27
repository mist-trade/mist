## ADDED Requirements

### Requirement: Delivery Serialization, Send-Before-Fill Ordering, Replay Ordering, And Virtual Fill Column Projection
- `AlertChannelDeliveryService` SHALL serialize channel group execution per `securityId`, construct messages from read-only snapshot projection, and persist assumed virtual fills (`appendAssumedFill`) ONLY after `adapter.send` returns `status === 'sent'`.
- `AlertChannelDeliveryService` SHALL pass `securityId` to `buildTradingManual` and preserve real `pivotTime` and `pivotPrice` in `toSignalInput`.
- `AlertReplayService` SHALL transition stuck `AlertEvent` records back to `PENDING` BEFORE calling `enqueueChannelReplay`.
- `VirtualFillLogService.loadBySecurity` SHALL project only the ledger columns required by `foldVirtualFills`, omitting the `instruction` JSON column.

#### Scenario: Failed delivery does not write phantom virtual fills
- **WHEN** `AlertChannelDeliveryService` renders a BUY instruction and `adapter.send` returns `transient_failure` or `permanent_failure`
- **THEN** `fillLog.append` MUST NOT be called

#### Scenario: Replay resets AlertEvent before enqueueing jobs
- **WHEN** `AlertReplayService.replay` resets stuck deliveries and re-enqueues jobs
- **THEN** `alertEvents.update(..., { status: StrategyAlertStatus.PENDING })` MUST complete before `queue.enqueueChannelReplay(...)` is invoked
