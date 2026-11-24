# orderbook-execution Specification

## Purpose
Define the order-book snapshot contract, deterministic depth-walking fill engine, A-share execution
constraints, per-ledger-group fill allocation, and physical-versus-attributed ledger reconciliation
shared by backtest, paper, and live execution.

## ADDED Requirements

### Requirement: Order Book Snapshot Shall Be A First-Class Contract

The system SHALL define an `OrderBookSnapshot` contract containing `securityId`, `source`,
`eventTime`, `receivedAt`, `sequence`, `phase`, ordered `bids` and `asks` levels, `lastPrice`,
`prevClose`, `limitUp`, `limitDown`, and quality flags. Prices SHALL use `Decimal8`; quantities
SHALL be integer shares.

#### Scenario: Level ordering
- **WHEN** a snapshot is accepted
- **THEN** bid prices MUST be strictly descending and ask prices MUST be strictly ascending
- **AND** a snapshot violating ordering SHALL be rejected with `BOOK_INVALID`.

#### Scenario: Unit normalization
- **WHEN** a QMT native tick reports volumes in lots
- **THEN** the adapter SHALL multiply them by 100 to produce shares
- **AND** the resulting snapshot SHALL contain only integer share quantities.

#### Scenario: No canonical snapshot pollution
- **WHEN** the order book is projected from a realtime tick
- **THEN** the existing `CanonicalRealtimeSnapshot` shape SHALL remain unchanged
- **AND** the book SHALL be published as a separate projection.

### Requirement: Book Snapshots Shall Be Recorded With Coverage Metadata

The system SHALL record realtime book snapshots for replay and audit, and SHALL track per-security,
per-trading-day coverage including first/last timestamp, snapshot count, gaps, and capability level.
The recording SHALL NOT be stored as a high-volume MySQL table.

#### Scenario: Continuous-session recording
- **WHEN** a security is subscribed during a continuous trading session
- **THEN** its book snapshots SHALL be appended to a replayable archive
- **AND** the coverage metadata SHALL be updated for that trading day.

#### Scenario: Coverage report
- **WHEN** an order-book backtest is requested
- **THEN** the system SHALL verify coverage for every security and trading day in the range
- **AND** it SHALL fail with `BOOK_DATA_UNAVAILABLE` if coverage is missing and synthetic is not
  explicitly allowed.

### Requirement: Book Sources Shall Not Be Mixed Within A Snapshot

A snapshot SHALL come from exactly one source. When switching between sources, the system SHALL
start a new snapshot and SHALL record a source-switch audit event.

#### Scenario: Source switch
- **WHEN** the primary source becomes unavailable and a fallback source takes over
- **THEN** the next snapshot SHALL be built entirely from the fallback source
- **AND** a `source_switch` audit event SHALL record the previous and new source
- **AND** the first fill after the switch SHALL carry the new source in its audit record.

### Requirement: Execution Shall Enforce Book Causality

No fill SHALL use a book snapshot that was not observable after the intent became actionable.

#### Scenario: Book after signal
- **WHEN** a plan is created from an intent with `emittedAt = T`
- **THEN** the selected snapshot MUST satisfy `receivedAt > T`
- **AND** the fill time MUST be greater than or equal to the snapshot's `eventTime`
- **AND** a snapshot with `receivedAt <= T` MUST be rejected as look-ahead.

#### Scenario: Replay uses recorded availability
- **WHEN** a historical book stream is replayed
- **THEN** selection SHALL use the recorded `receivedAt`, not the replay process's clock
- **AND** out-of-order snapshots SHALL be discarded in the same way as live execution.

### Requirement: Book Quality Shall Be Explicitly Classified

Every snapshot SHALL declare its capability level (`L2`, `L1`, `SYNTHETIC`) and quality flags
(`stale`, `crossed`, `one_sided`, `gapped`). The execution engine SHALL NOT silently treat a
lower-quality source as a full-depth book.

#### Scenario: Stale book
- **WHEN** `receivedAt - eventTime` exceeds the configured `maxAgeMs`
- **THEN** the snapshot SHALL be marked `stale`
- **AND** new entry plans SHALL be blocked with `BOOK_UNAVAILABLE`
- **AND** exit plans MAY retry under the configured degradation policy.

#### Scenario: Crossed book
- **WHEN** `bestBid >= bestAsk` outside an auction phase
- **THEN** the snapshot SHALL be marked `crossed`
- **AND** no matching SHALL occur against it.

#### Scenario: Synthetic book
- **WHEN** no real book is available and `allowSynthetic` is true
- **THEN** the engine MAY construct a deterministic synthetic book from the bar
- **AND** the snapshot MUST be marked `SYNTHETIC`
- **AND** the resulting fills MUST be labelled `synthetic` in the execution result.

### Requirement: Orders Shall Use Protected Marketable Limits

The engine SHALL submit buy and sell orders as marketable limit orders with a protection band and a
maximum slippage cap relative to the arrival price. Unbounded market orders SHALL NOT be used.

#### Scenario: Buy limit calculation
- **WHEN** a buy plan is created with arrival price `P`, best ask `A`, protection `k` ticks, and
  maximum slippage `s` basis points
- **THEN** the limit price SHALL be
  `min(limitUp, A + k * tickSize, P * (1 + s / 10000))`
- **AND** it SHALL be rounded to a valid tick without exceeding the computed bound.

#### Scenario: Sell limit calculation
- **WHEN** a sell plan is created with arrival price `P`, best bid `B`, protection `k` ticks, and
  maximum slippage `s` basis points
- **THEN** the limit price SHALL be
  `max(limitDown, B - k * tickSize, P * (1 - s / 10000))`
- **AND** it SHALL be rounded to a valid tick without exceeding the computed bound.

#### Scenario: Risk cut urgency
- **WHEN** a plan has `urgency = URGENT`
- **THEN** the maximum slippage cap MAY be relaxed to the limit-down price
- **AND** the relaxation SHALL be recorded in the execution audit.

### Requirement: Fills Shall Walk The Book With A Participation Cap

The engine SHALL consume levels in price priority and SHALL cap the quantity taken from each level
by a configurable participation ratio of the displayed volume.

#### Scenario: Buy depth walk
- **WHEN** a buy plan with quantity `Q` is matched against asks
- **THEN** the engine SHALL consume asks from the lowest price upward
- **AND** the quantity taken at each level SHALL NOT exceed
  `floor(level.volume * maxParticipation / lotSize) * lotSize`
- **AND** matching SHALL stop when `Q` is filled or the next ask price exceeds the limit price.

#### Scenario: Sell depth walk
- **WHEN** a sell plan with quantity `Q` is matched against bids
- **THEN** the engine SHALL consume bids from the highest price downward
- **AND** the quantity taken at each level SHALL NOT exceed
  `floor(level.volume * maxParticipation)`
- **AND** matching SHALL stop when `Q` is filled or the next bid price is below the limit price.

#### Scenario: Partial fill
- **WHEN** the available liquidity within the limit price is less than `Q`
- **THEN** the engine SHALL fill the available quantity and record a partial fill
- **AND** the remainder SHALL follow the configured remainder policy.

### Requirement: Remainder Handling Shall Depend On Intent Kind

The engine SHALL apply different remainder policies for entries, ordinary exits, and risk cuts.

#### Scenario: Entry remainder
- **WHEN** an entry plan is partially filled and no more liquidity exists within the limit
- **THEN** the remainder SHALL be canceled by default
- **AND** the plan SHALL be recorded as `PARTIALLY_FILLED_CANCELED`.

#### Scenario: Exit retry
- **WHEN** an ordinary exit plan is partially filled
- **THEN** the remainder SHALL be retried against a newer snapshot until the configured deadline
- **AND** each retry MUST use a snapshot with `receivedAt` greater than the previous attempt.

#### Scenario: Risk-cut retry
- **WHEN** a `RISK_CUT` plan cannot be fully filled
- **THEN** it SHALL retry with `URGENT` urgency until filled, the limit-down price is locked, or the
  session closes
- **AND** a locked limit-down SHALL produce `SELL_BLOCKED_LIMIT_DOWN` and an operator alert.

### Requirement: A-Share Trading Rules Shall Be Enforced

The engine SHALL enforce lot size, T+1, price limits, tick size, fees, suspension, and auction
phases for every fill.

#### Scenario: Buy lot size
- **WHEN** a buy quantity is not a multiple of 100
- **THEN** it SHALL be rounded down to a whole lot
- **AND** a quantity below one lot SHALL NOT be submitted.

#### Scenario: Sell odd lots
- **WHEN** a ledger group holds an odd-lot position from a corporate action
- **THEN** the engine MAY sell the entire odd lot
- **AND** it SHALL NOT create a new odd-lot buy.

#### Scenario: T+1
- **WHEN** a position is bought on trading day `D`
- **THEN** it SHALL be frozen and unavailable for sale on `D`
- **AND** it SHALL become available at the day-close settlement for `D+1`.

#### Scenario: Limit-up buy rejection
- **WHEN** the ask side is locked at the limit-up price with no executable volume
- **THEN** a buy order SHALL be rejected with `BUY_REJECTED_LIMIT_UP`.

#### Scenario: Limit-down sell block
- **WHEN** the bid side is locked at the limit-down price with no executable volume
- **THEN** a sell order SHALL be blocked with `SELL_BLOCKED_LIMIT_DOWN`
- **AND** it SHALL remain pending for the next executable session.

#### Scenario: Fees
- **WHEN** a fill is booked
- **THEN** commission, transfer fee, and stamp duty SHALL be calculated using the physical order's
  turnover
- **AND** stamp duty SHALL apply only to stock sells and SHALL be zero for ETFs
- **AND** the minimum commission SHALL apply once per physical order, not once per level.

### Requirement: Order Submission Shall Reserve Cash And Shares

Before an order is submitted, the system SHALL reserve the maximum cash or shares it may consume.
Reservations SHALL be released on cancellation or rejection and adjusted to the actual amount on
fill. The same cash or shares SHALL NOT be reserved by two concurrent plans.

#### Scenario: Buy reservation
- **WHEN** a buy order is submitted at limit price `L` for quantity `Q`
- **THEN** the system SHALL reserve `L * Q + estimated fees` from available cash
- **AND** a fill SHALL release the difference between the reservation and the actual cost
- **AND** a cancellation or rejection SHALL release the full remaining reservation.

#### Scenario: Sell reservation
- **WHEN** a sell order is submitted for quantity `Q`
- **THEN** the system SHALL move `Q` shares from available to frozen
- **AND** a fill SHALL deduct the frozen shares
- **AND** a cancellation or rejection SHALL return the remaining frozen shares to available.

#### Scenario: Insufficient reservation
- **WHEN** available cash or available shares are insufficient for the reservation
- **THEN** the order SHALL be rejected with `INSUFFICIENT_CASH` or `INSUFFICIENT_SHARES`
- **AND** no partial reservation SHALL remain.

### Requirement: Fills Shall Be Allocated To Ledger Groups Without Loss

Every fill SHALL be allocated across the plan's ledger groups in proportion to their requested
quantities, and the sum of allocations SHALL equal the filled quantity.

#### Scenario: Pro-rata allocation
- **WHEN** a fill of quantity `F` is allocated across groups with requested quantities `q_i`
- **THEN** each allocation SHALL be `floor(F * q_i / Σq)`
- **AND** remaining shares SHALL be distributed by largest fractional remainder, with ties broken by
  ascending `ledgerGroupKey`
- **AND** `Σ allocation_i` MUST equal `F`.

#### Scenario: Fee allocation
- **WHEN** a physical fill incurs fees
- **THEN** fees SHALL be allocated across groups in proportion to allocated turnover
- **AND** any rounding difference SHALL be assigned to the largest allocation
- **AND** `Σ allocatedFees` MUST equal the physical fee total.

#### Scenario: Partial fill allocation
- **WHEN** a plan is filled in multiple partial fills
- **THEN** each partial fill SHALL be allocated using the same requested proportions
- **AND** the cumulative allocations MUST NOT exceed any group's requested quantity.

### Requirement: Physical And Attributed Ledgers Shall Reconcile

The system SHALL maintain one physical account ledger and one attributed ledger per
`(securityId, ledgerGroupKey)`. The sum of attributed ledgers SHALL equal the physical ledger at all
times.

#### Scenario: Post-fill reconciliation
- **WHEN** a fill is booked
- **THEN** the physical position and every affected group position SHALL be updated atomically
- **AND** the sum of group totals, available quantities, and frozen quantities SHALL equal the
  physical values.

#### Scenario: Drift detection
- **WHEN** reconciliation detects a mismatch
- **THEN** the system SHALL immediately block new orders for the affected security
- **AND** it SHALL emit a critical alert
- **AND** live mode SHALL transition to `DISARMED` with exits still allowed.

#### Scenario: Broker reconciliation
- **WHEN** the execution application starts or reconnects to a live broker
- **THEN** it SHALL query broker cash, positions, and open orders
- **AND** it SHALL reconcile them against the physical ledger before accepting new intents
- **AND** unresolved differences SHALL keep the system disarmed.

### Requirement: Live Broker Events Shall Be Authoritative

In live mode, the broker's order and trade events SHALL be the authoritative source of fill price
and quantity. The local order book SHALL be used for limit-price selection and transaction-cost
analysis, not for fabricating local fills.

#### Scenario: Live fill
- **WHEN** a live order is acknowledged and the broker reports a trade
- **THEN** the local fill record SHALL be created from the broker's trade event
- **AND** the book snapshot used for the limit price SHALL be stored for audit
- **AND** the local engine SHALL NOT create a fill solely from its own book walk.

#### Scenario: Unknown order state
- **WHEN** an order receives no broker response within the configured timeout
- **THEN** it SHALL be marked `UNKNOWN`
- **AND** the system SHALL query the broker rather than resubmit
- **AND** new orders for the security SHALL be blocked until the state is resolved.

### Requirement: Execution Shall Be Replayable And Auditable

Every plan, order, fill, allocation, and suppression SHALL be persisted with deterministic
identifiers and sufficient context to replay the decision.

#### Scenario: Audit chain
- **WHEN** a fill is queried
- **THEN** the system SHALL return the originating signal, intent, plan, order, book snapshot
  reference, limit-price calculation, fees, and per-group allocation
- **AND** the chain SHALL be queryable by `traceId`.

#### Scenario: Deterministic replay
- **WHEN** the same intent stream, book stream, and ledger snapshot are replayed
- **THEN** the engine SHALL produce identical `planId`, `orderId`, `fillId`, allocation quantities,
  and ledger balances
- **AND** no randomness or wall-clock dependency SHALL affect the result.

### Requirement: Backtest Shall Support Bar And Order-Book Execution Modes

Backtests SHALL select an execution model explicitly. The existing bar-based model SHALL remain the
default and SHALL remain unchanged. The order-book model SHALL require a real recorded book or
explicitly allow a synthetic book.

#### Scenario: Bar mode preserved
- **WHEN** a backtest does not specify an execution model
- **THEN** it SHALL use the existing next-bar-open simulation
- **AND** its results SHALL remain backward compatible.

#### Scenario: Order-book mode without data
- **WHEN** an order-book backtest is requested for a period without recorded book coverage
- **THEN** the run SHALL fail with `BOOK_DATA_UNAVAILABLE`
- **AND** it SHALL NOT silently substitute a synthetic book unless `allowSynthetic` is explicitly
  set.

#### Scenario: Synthetic result labelling
- **WHEN** a backtest runs with a synthetic book
- **THEN** the run result MUST carry an `executionQuality = synthetic` marker
- **AND** the UI/report SHALL distinguish it from real-book results.
