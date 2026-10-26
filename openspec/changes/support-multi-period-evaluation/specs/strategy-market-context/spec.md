# strategy-market-context Specification Delta

## REMOVED Requirements

### Requirement: Realtime Windows Shall Remain Source-Exact

**Reason**: Realtime history now assembles from the canonical splice policy — the same series
backtest replays — while the current trading day keeps the accepted trigger's source for the
whole day. Requiring every historical bar to come from the trigger's exact TDX/QMT source would
pin realtime evaluation to whichever provider happens to trigger first and would silently lose
all history before that provider's earliest bar (2025-07 for QMT 5m/30m).

**Migration**: Replaced by "Realtime Windows Shall Combine Canonical History With The Trigger
Source For The Current Day" below. The stale episode-identity scenario of the removed
requirement is retired with the episode store it described.

## ADDED Requirements

### Requirement: Realtime Windows Shall Combine Canonical History With The Trigger Source For The Current Day

Realtime windows SHALL assemble history from the canonical splice policy for every bar whose
trading day is before the trigger's trading day, and SHALL keep the accepted trigger's exact
source for the whole current trading day without switching sources intraday. The trigger source
SHALL continue to gate strategy eligibility as an allowed-source set. Quantities keep the
provider-neutral A-share unit contract of this capability for both segments.

#### Scenario: A realtime window is hydrated
- **WHEN** `loadRealtimeWindow()` receives a security, trigger source, period, anchor and
  required bar count
- **THEN** the grouping identity MUST be `(securityId, source)`
- **AND** bars whose trading day is before the anchor's trading day MUST come from the canonical
  series assembled by the splice policy
- **AND** bars of the anchor's trading day MUST come only from that trigger source's sealed 1m
  facts and derived periods

#### Scenario: The current day never switches sources
- **WHEN** sealed triggers of one trading day arrive for one security
- **THEN** every current-day bar MUST belong to the day's first accepted trigger source
- **AND** a trigger whose source differs MUST NOT contribute bars to that day's window

#### Scenario: Canonical history is insufficient
- **WHEN** one execution plan lacks sufficient canonical history or current-day bars
- **THEN** only that plan MUST return `status='unavailable'` with the bounded reason
- **AND** another plan whose own context demand is satisfied MUST remain eligible for evaluation
- **AND** the port MUST NOT fall back to a provider outside the splice policy or select a source
  by arrival order

#### Scenario: Strategy source eligibility is evaluated
- **WHEN** a trigger source is compared with `StrategyDefinition.sources`
- **THEN** the collection MUST be treated as an allowed-source set rather than a priority list
- **AND** a trigger whose source is absent MUST NOT evaluate that strategy
- **AND** EF MUST NOT be treated as a realtime trigger source

#### Scenario: Internal read types are named
- **WHEN** realtime selection inputs and results are declared
- **THEN** internal selection inputs MUST use the `*Criteria` convention
- **AND** internal results MUST use domain names such as `*Window` or `*Observation`
- **AND** they MUST NOT use HTTP `*QueryDto` or `*Vo` naming

#### Scenario: The splice policy does not cover a realtime period
- **WHEN** a group's declared evaluation or context period has no segment in the effective splice
  policy at group build or warmup time
- **THEN** the group build MUST fail with the bounded canonical-policy error
- **AND** the failure MUST be observable through the same isolation and diagnostics path as any
  other hydration failure
- **AND** the runtime MUST NOT fall back to a provider outside the policy or serve the period
  from an empty window

### Requirement: Realtime Multi-Period Groups Shall Share One Kernel Per Security And Source

The realtime lane SHALL group windows and kernel instances by `(securityId, source)` and SHALL
maintain one window per period declared by the group's plans (evaluation periods plus context
periods, including the derived trading-day period 1440). The realtime evaluation service SHALL
feed every accepted bar into the group kernel; the kernel SHALL dispatch evaluation by each
plan's evaluation period. Group retention, trading-day rollover and diagnostics SHALL operate on
the `(securityId, source)` group with its per-period windows.

#### Scenario: A group hydrates every declared period
- **WHEN** a group's first bar triggers hydration or the 09:20 pre-market warmup builds the group
- **THEN** the runtime MUST load each declared period's required bars through the same
  `loadRealtimeWindow` capability
- **AND** the pre-warm push order MUST follow the causal merge order of the kernel capability

#### Scenario: Every accepted bar reaches the kernel
- **WHEN** a derived or sealed bar of a context period arrives
- **THEN** the realtime evaluation service MUST push it into the group kernel
- **AND** it MUST NOT filter the bar out for lacking a plan whose evaluation period equals the
  bar's period

#### Scenario: Candidates carry the plan's evaluation period
- **WHEN** a plan evaluating on 30m emits a signal while a 5m context bar is in flight
- **THEN** the persisted candidate MUST carry the 30m evaluation period
- **AND** signal time MUST remain the 30m bar's timestamp

#### Scenario: Group retention releases per-period windows
- **WHEN** a group loses its final consumer or the runtime releases state
- **THEN** every per-period window of the group MUST be released together
- **AND** diagnostics MUST report window counts per the `(securityId, source)` group

## MODIFIED Requirements

### Requirement: Derived Period Bars Shall Remain Canonical Consumable Bars
Realtime 5/15/30/60 minute periods and the trading-day 1440 period SHALL be derived from sealed
1m bars in fixed A-share morning and afternoon session slots without crossing the lunch break,
and SHALL represent partial constituent coverage through the same canonical bar contract. Every
derived intraday bar SHALL carry a slot-end timestamp (`slotStart + period minutes`) so that
derived bars share one timestamp label convention with the canonical provider-native historical
bars of the same period; the sealed 1m bars themselves SHALL keep the producer's left bucket-start
label, which is identical to the provider-native 1m history label. The last window of each
session SHALL absorb the session-terminal 1m bucket (`11:30`, `15:00`) as an optional constituent
and SHALL close on the terminal bucket's finalization trigger, so late-arriving terminal prints
and the closing auction enter the session's last derived bar exactly as the provider-native
history attributes them.

#### Scenario: A derived window has not reached its boundary
- **WHEN** the fixed period window is still collecting constituents
- **THEN** its internal completeness outcome MUST remain unknown
- **AND** no `StrategyBar` with `type='unknown'` MUST be emitted

#### Scenario: A derived window reaches a terminal outcome
- **WHEN** the fixed period boundary is reached
- **THEN** the builder MUST emit at most one `complete` or `incomplete` bar according to constituent coverage
- **AND** zero available constituents MUST produce no bar
- **AND** V1 late-data rejection MUST prevent a terminal complete/incomplete bar from being revised into the
  other type

#### Scenario: The final theoretical constituent has no snapshot
- **WHEN** the candle foundation's active-listener due commits a discarded watermark for the final 1m slot
- **THEN** its `candle_finalized` trigger MUST close every derived window ending at that slot
- **AND** Signal MUST NOT require a later valid K, a local session/grace timer or a database query to close it
- **AND** the builder MUST apply the same complete, incomplete or zero-bar rule as any other terminal boundary

#### Scenario: An upstream restart leaves an unrecoverable finalization gap
- **WHEN** candle foundation explicitly cannot recover an already elapsed theoretical bucket
- **THEN** Signal MUST preserve the missing trigger rather than synthesize a finalization or historical K
- **AND** the accepted best-effort gap MUST remain observable through the owning market/handoff boundary

#### Scenario: Every constituent minute exists
- **WHEN** a derived period reaches its fixed session-aligned boundary and every required 1m bar exists
- **THEN** the builder MUST produce one canonical derived bar with `type='complete'`

#### Scenario: Some constituent minutes are absent
- **WHEN** a derived period reaches its fixed session-aligned boundary with at least one available 1m bar and
  one or more missing or discarded constituent minutes
- **THEN** the builder MUST produce one canonical derived bar with `type='incomplete'`
- **AND** the bar MUST enter the same shared window and Indicator and evaluator path as a complete bar
- **AND** runtime MUST NOT filter it, return unavailable or change episode state solely because of its type

#### Scenario: The first constituent minute is absent
- **WHEN** a fixed derived-period slot contains later 1m bars but its first theoretical minute is missing
- **THEN** the derived bar `timestamp` MUST remain the slot end (`slotStart + period minutes`)
- **AND** it MUST NOT use the first or last available constituent timestamp as its canonical identity

#### Scenario: The session-terminal bucket joins the session's last window
- **WHEN** the last fixed-period window of one session reaches the terminal bucket (`11:30` or
  `15:00`)
- **THEN** the window MUST close on the terminal bucket's finalization trigger, not on the last
  regular constituent's trigger
- **AND** a sealed terminal bar MUST contribute its OHLCV into the derived bar
- **AND** a discarded terminal bucket MUST contribute nothing without fabricating values
- **AND** the terminal bucket MUST NOT count toward completeness: completeness MUST be judged on
  the window's regular constituent slots only, so the derived bar's type matches the
  provider-native history bar of the same label
- **AND** no orphan pending slot MAY survive the terminal trigger

#### Scenario: Derived timestamps align with canonical history
- **WHEN** a derived 30m bar covers 09:30–10:00 of one trading day
- **THEN** its timestamp MUST be 10:00, matching the provider-native canonical 30m bar label for
  the same window
- **AND** the sealed 1m bar of the 09:30 bucket MUST keep the left bucket-start label, matching
  the provider-native 1m history bar for the same window
- **AND** a hydrated pre-warm window MUST NOT contain a derived bar whose slot end is later than
  the hydration anchor
- **AND** an in-progress slot MUST NOT be reduced and injected as a bar before its boundary
  finalizes

#### Scenario: Available constituents are reduced into OHLC
- **WHEN** a complete or incomplete derived-period slot contains one or more accepted 1m bars
- **THEN** open MUST be the earliest available constituent open
- **AND** close MUST be the latest available constituent close
- **AND** high and low MUST be the extrema of only the available constituent highs and lows
- **AND** missing slots MUST NOT contribute zero, a carried-forward price, a copied neighbor, or any invented
  price

#### Scenario: Available constituents are reduced into quantities
- **WHEN** a complete or incomplete derived-period slot contains actual constituent volume or amount strings
- **THEN** each field MUST be parsed and summed independently through the candle foundation's shared scale-eight
  `Decimal8` primitive without passing through JavaScript number
- **AND** every intermediate result MUST fit `DECIMAL(36,8)` bounds before it is formatted as a canonical string
- **AND** the period builder MUST NOT implement a second parser, add a decimal dependency or serialize raw bigint
- **AND** an explicit canonical `"0"` MUST contribute zero
- **AND** a wholly missing constituent bar MUST NOT be replaced with zero
- **AND** an incomplete result with non-null quantity MUST mean the observed-constituent subtotal rather than
  claim complete-period coverage

#### Scenario: Period aggregation would require unsupported decimal arithmetic
- **WHEN** a future derived field requires multiplication, division, averaging, ratios or rounding
- **THEN** V1 MUST NOT approximate it with bigint or JavaScript number
- **AND** a focused change MUST define scale and rounding semantics before that field is implemented

#### Scenario: An actual constituent quantity is null
- **WHEN** at least one available constituent has `volume=null` or `amount=null`
- **THEN** the corresponding derived field MUST be null while the other quantity field is decided independently
- **AND** aggregation MUST NOT ignore the null, fill it with zero, or carry a prior bar into the sum
- **AND** only after the derived bar is finalized MAY the shared projector resolve that raw null from an earlier
  effective value of the same `(securityId,source,period,tradingDay)`
- **AND** the consumed field MUST receive `field_unavailable` only when that same-day derived-period seed is absent

#### Scenario: A sixty-minute period is aligned
- **WHEN** 60m bars are derived for an A-share trading day
- **THEN** their fixed windows MUST be `09:30–10:30`, `10:30–11:30`, `13:00–14:00`, and `14:00–15:00`
- **AND** no window MUST cross the lunch break

#### Scenario: The trading-day period closes at the session terminal
- **WHEN** the session-terminal 15:00 bucket of a trading day finalizes (sealed or discarded)
- **THEN** the builder MUST emit at most one 1440 bar for that trading day
- **AND** the bar's timestamp MUST be the canonical daily identity `00:00` of that trading day,
  identical to the canonical history label, so realtime and backtest carry one identity per day
- **AND** the bar MUST be `complete` only when every expected 1m bucket of the day
  (`[09:30,11:31) ∪ [13:00,15:01)`) is present, otherwise `incomplete`
- **AND** no 1440 bar MUST be emitted before the session-terminal bucket finalizes
- **AND** a hydration anchor earlier than the terminal bucket MUST NOT inject that day's 1440 bar

#### Scenario: The daily 00:00 identity carries trading-day semantics
- **WHEN** a daily bar or a daily-plan signal carries the timestamp `00:00` of trading day D
- **THEN** the bar MUST be understood and documented as trading day D's completed-session daily
  bar (constituents of D, closed after D's terminal bucket, closing auction included) — never as
  data formed or available at the midnight instant
- **AND** documentation, API metadata and signal display MUST present it by its trading date so
  downstream consumers MUST NOT misread it as the current, still-forming day's bar

#### Scenario: No constituent minute exists
- **WHEN** a derived period reaches its boundary without any available constituent 1m bar
- **THEN** no derived `StrategyBar` MUST be produced because required OHLC cannot be formed

#### Scenario: A strategy requires one completeness type
- **WHEN** a strategy rule explicitly references `k.type`
- **THEN** the field MUST expose `complete | incomplete` and support only `eq` or `ne`
- **AND** a strategy without that condition MUST continue to consume both types

#### Scenario: A derived bar triggers a persisted signal
- **WHEN** evaluation of a complete or incomplete derived bar produces a persisted candidate
- **THEN** immutable context and persisted `contextSnapshot` MUST retain that bar's actual `type`
- **AND** they MUST retain the existing `source` and the canonical effective value actually evaluated
- **AND** `StrategyBar` MUST NOT add observed/expected counts or a per-bar precision field in V1
- **AND** provider precision MUST be interpreted from the source's approved adapter contract

#### Scenario: A realtime quantity contributes to a persisted signal
- **WHEN** a matched live evaluation consumes a current or prior quantity observation
- **THEN** the Signal `contextSnapshot` MUST use the serializer owned by
  `evolve-strategy-evaluation-contract`
- **AND** `k.volume/k.amount` MUST remain the canonical effective scalar actually evaluated
- **AND** every quantity observation required by the compiled plan MUST be represented under the applicable
  `quantityEvidence.current` or `quantityEvidence.previous` field with canonical `raw`, non-null canonical
  `effective` and `resolution='observed'|'forwardFilled'`
- **AND** the evidence set MUST be independent of `all/any` runtime short-circuit order
- **AND** the realtime runtime MUST NOT invent a second provenance shape or add evidence to `StrategyBar`

#### Scenario: A realtime quantity remains unavailable
- **WHEN** a compiled plan requires a quantity observation whose effective value remains null
- **THEN** evaluation MUST be unavailable and MUST NOT persist a Signal or `contextSnapshot`
- **AND** `unavailable` MUST NOT be serialized as a quantity-evidence resolution

#### Scenario: A constituent minute arrives after derivation
- **WHEN** a 1m bar arrives after V1 has emitted its derived bar for that fixed period
- **THEN** the late bar MUST be discarded for derived-period purposes
- **AND** the runtime MUST NOT revise, backfill or re-trigger the existing derived bar

#### Scenario: A valid bar has a nullable quantity
- **WHEN** required OHLC, identity, source, period and timestamp are valid but `volume` or `amount` is `null`
- **THEN** the complete bar MUST remain in the shared window and count as an accepted valid bar
- **AND** each nullable field MUST remain `null`
- **AND** the runtime MUST NOT remove the field, remove the bar or replace the value with zero
- **AND** an execution plan that does not consume the unavailable field MUST remain eligible

#### Scenario: A plan consumes a nullable field
- **WHEN** the current bar's approved nullable field is `null`
- **THEN** the raw current `StrategyBar` MUST remain unchanged
- **AND** `QuantityForwardFillProjector` MUST use the nearest earlier effective value in the same
  `(securityId,source,period,tradingDay)` when one exists
- **AND** evaluation MUST return `status='unavailable'` with reason `field_unavailable` only when that same-day
  earlier value does not exist
- **AND** an unavailable evaluation MUST NOT create a Signal or persisted context snapshot

#### Scenario: A later bar contains the first quantity value of the day
- **WHEN** the current consumed quantity is null and only a later bar is non-null
- **THEN** the current field MUST remain unavailable for that evaluation
- **AND** the projector MUST NOT read future bars or revise the earlier evaluation

#### Scenario: A new trading day begins without an observed quantity
- **WHEN** the first consumed quantity of a trading day is null
- **THEN** the field MUST remain unavailable until that day observes a non-null value
- **AND** the projector MUST NOT inherit the previous trading day's final quantity

#### Scenario: A canonical bar violates its required contract
- **WHEN** required OHLC, identity or timestamp is invalid, or a non-null decimal representation is malformed
- **THEN** the current trigger or hydration operation MUST fail at the worker boundary
- **AND** the invalid bar MUST NOT enter the window or be converted to evaluation unavailable
