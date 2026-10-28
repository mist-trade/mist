# tactical-event-pipeline Specification Delta

## ADDED Requirements

### Requirement: Inside-Bar Containment Keep-Alive For Tactical Observation Windows
The `TemporalWindowEngine` SHALL detect inside-bar containment relationships (`currentBar.high <= lastBar.high && currentBar.low >= lastBar.low`) during active observation window evaluation. When an inside bar occurs without breaking the trigger's structural stop loss (`pivotPrice`), the engine SHALL freeze/pause the effective countdown consumption of the window up to a configurable maximum containment hold limit (`maxContainmentHoldBars`, default 2).

#### Scenario: Inside-bar consolidation freezes observation countdown
- **WHEN** an entry observation window is active with `windowBars = 3`
- **AND** the next physical bar is an inside bar (`high <= prevHigh && low >= prevLow`)
- **AND** the closing price remains above the trigger's `pivotPrice`
- **THEN** `TemporalWindowEngine` MUST NOT decrement the remaining effective window bars
- **AND** it MUST increment the `heldContainmentBars` counter while keeping the window active

#### Scenario: Breakout confirmation after inside-bar hold synthesizes event
- **WHEN** an observation window has experienced 1 or 2 inside bars under the hold limit
- **AND** a subsequent breakout physical bar triggers a required confirmation factor (e.g. VPCI confirmation)
- **THEN** `TemporalWindowEngine` MUST synthesize a valid `TacticalEvent` without being prematurely expired

#### Scenario: Excessive containment beyond hold limit expires window
- **WHEN** an observation window experiences continuous inside bars exceeding `maxContainmentHoldBars`
- **THEN** subsequent inside bars MUST consume effective window countdown until `windowBars` is exhausted
- **AND** the window MUST expire cleanly once the total budget is exceeded

---

### Requirement: Autonomous Trigger Plugin Tactical Window Policy
The `TemporalWindowEngine` SHALL dynamically respect tactical window parameters (`windowBars` and `maxContainmentHoldBars`) emitted directly by the trigger factor plugin via `signal.evidence` or plugin policy overrides. The engine SHALL prioritize signal-provided tactical policy over aggregator-level defaults.

#### Scenario: Signal-level policy overrides global window settings
- **WHEN** a trigger factor plugin emits a buy signal with `evidence.windowBars = 4` and `evidence.maxContainmentHoldBars = 3`
- **THEN** `TemporalWindowEngine` MUST open the observation window using `windowBars = 4` and `maxContainmentHoldBars = 3`
- **AND** it MUST NOT be restricted to the global default `windowBars = 3`

---

### Requirement: Immediate Pruning On Pivot Price Breakdown
When an active buy observation window is observing subsequent physical bars, if a sealed bar's close price breaks below the trigger's `pivotPrice` ($P_{close} < P_{pivot}$), the engine SHALL immediately invalidate and prune the observation window without waiting for countdown expiration.

#### Scenario: Pullback breaks pivot price invalidating buy window
- **WHEN** an active buy observation window has a recorded `pivotPrice` of 10.0
- **AND** a subsequent physical bar closes at 9.8 (< 10.0)
- **THEN** the observation window MUST be pruned immediately on that bar
- **AND** subsequent confirmation signals arriving for that trigger MUST be ignored
