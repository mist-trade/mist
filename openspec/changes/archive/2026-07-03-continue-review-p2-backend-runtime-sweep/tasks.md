## 1. Contract And Unit Tests First

- [x] 1.1 Add failing backend runtime sweep contract checks for selected weak
      patterns: `ISourceFetcher<any>`, indicator double period cast, duplicated
      MCP query builder chains, duplicated WebSocket K save paths, EF nullable
      defaults, TDX WebSocket timing literals, and Chan unsafe non-null merge
      assumptions.
- [x] 1.2 Add focused failing Jest coverage for `PeriodMappingService`
      source-format reverse mapping and `IndicatorService.findKData` period
      usage.
- [x] 1.3 Add focused failing Jest coverage for TDX WebSocket timing config.
- [x] 1.4 Add focused failing Jest coverage for structured `getLatestData`
      period results and shared MCP query builder behavior.
- [x] 1.5 Add focused failing Jest coverage for WebSocket KData persistence
      through a shared save path.
- [x] 1.6 Add focused failing Jest coverage for Chan merge invariant errors and
      EF nullable default metadata.
- [x] 1.7 Run focused tests/contracts and confirm the new checks fail against
      the current repository state.

## 2. Type, Config, And Period Mapping

- [x] 2.1 Replace `CollectorService` source map `ISourceFetcher<any>` with an
      explicit union type.
- [x] 2.2 Add source-format reverse mapping to `PeriodMappingService` and use it
      in TDX WebSocket bar parsing.
- [x] 2.3 Remove the `String(query.period) as unknown as Period` cast from
      `IndicatorService.findKData`.
- [x] 2.4 Centralize TDX WebSocket reconnect and heartbeat timings with config
      fallback.

## 3. Query And Persistence Refactors

- [x] 3.1 Extract shared MCP K-line query builder construction and row mapping.
- [x] 3.2 Change `getLatestData` from array-position matching to structured
      period-result pairs.
- [x] 3.3 Extract WebSocket TDX KData construction/save logic used by both bar
      and candle callbacks.
- [x] 3.4 Keep existing public response shapes and logging behavior unchanged.

## 4. Chan, Error Semantics, And Entity Invariants

- [x] 4.1 Add Chan merge invariant guards to replace selected unsafe non-null
      assertions.
- [x] 4.2 Avoid duplicate merge work in `analyzeChanTheory` by reusing a single
      Chan analysis path.
- [x] 4.3 Make selected recoverable datasource empty-result behavior explicit and
      consistent.
- [x] 4.4 Align EF extension nullable fields with nullable TypeScript defaults.

## 5. Verification And Completion

- [x] 5.1 Run focused Jest suites for collector, WebSocket strategy, TDX
      WebSocket, MCP data/Chan services, indicator, period mapping, Bi service,
      and extension schema.
- [x] 5.2 Run `node tools/test-ci-contracts.mjs`.
- [x] 5.3 Run `pnpm run lint:check`, `pnpm run typecheck`, and `pnpm run test:ci`.
- [x] 5.4 Record review-ID to changed-file to verification-command evidence.
- [x] 5.5 Run `openspec validate continue-review-p2-backend-runtime-sweep --strict`.
- [x] 5.6 Commit the completed batch without staging unrelated production
      baseline evidence.
