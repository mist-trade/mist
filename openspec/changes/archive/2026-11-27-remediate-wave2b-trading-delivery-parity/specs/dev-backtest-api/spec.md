## ADDED Requirements

### Requirement: Dev Gateway Parity With Production Backtest Cache And Signal Responses
`tools/strategy-dev/server.ts` SHALL:
- Use `availabilityKey` for signal-group `effectiveTime`, pass `macroRegime` into `surveilBar` / `decide`, and invoke `recomputeNextBarOpenBuyQuantity` identically to `runTradingPipeline`;
- Return computed `navSeries`, non-empty compiled `ruleSnapshot`, and derived `externalContextRequirements` across cached and uncached `/v1/strategy-backtests` responses;
- Return real nullable `pivotTime` values without fabricating `signalTime` fallbacks or synthetic non-contract `chanBsp` fields.

#### Scenario: Cached dev backtest preserves navSeries and metadata
- **WHEN** a client requests `/v1/strategy-backtests` twice with identical inputs hitting `backtestSignalsCache`
- **THEN** the response MUST preserve the computed `navSeries`, `ruleSnapshot`, and `externalContextRequirements`
