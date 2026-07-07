# Tasks: Add strategy definition registry

## 1. Contract Tests

- [x] 1.1 Add route metadata tests for `/v1/strategies`,
      `/v1/strategy-signals`, `/v1/strategy-alert-events`, and
      `/v1/strategy-backtests`.
- [x] 1.2 Add rule validator tests for accepted declarative expressions and
      rejected arbitrary code or unsupported operators.
- [x] 1.3 Add service/controller tests for create, update, enable, disable,
      list, detail, version list, and pending backtest run creation.

## 2. Shared Data Model

- [x] 2.1 Add shared enums for strategy status, rule schema version, signal
      source, alert status, and backtest run status.
- [x] 2.2 Add TypeORM entities for `StrategyDefinition`, `StrategyVersion`,
      `StrategySignal`, `StrategyAlertEvent`, `BacktestRun`, and
      `BacktestSignalResult`.
- [x] 2.3 Export new entities/enums from `@app/shared-data`.
- [x] 2.4 Add `006_strategy_platform_core.sql` migration for the strategy
      platform core tables and indexes.

## 3. Backend Implementation

- [x] 3.1 Add `StrategyModule` and register strategy entities in the Mist
      TypeORM root configuration.
- [x] 3.2 Add DTOs for strategy create/update/query/version/backtest requests.
- [x] 3.3 Add `StrategyRuleValidator` for first-phase declarative rule JSON.
- [x] 3.4 Add `StrategyDefinitionService` with create, update, list, detail,
      enable, disable, and version list operations.
- [x] 3.5 Add signal, alert event, and backtest services with query and pending
      run creation boundaries.
- [x] 3.6 Add controllers for strategy registry, signals, alert events, and
      backtests under `/v1` paths.

## 4. Documentation And Roadmap

- [x] 4.1 Update README API tables with strategy registry and reserved
      signal/backtest endpoints.
- [x] 4.2 Update strategy roadmap disposition to mark
      `add-strategy-definition-registry` as created/in progress.

## 5. Verification

- [x] 5.1 Run focused strategy backend tests.
- [x] 5.2 Run TypeScript typecheck.
- [x] 5.3 Run `openspec validate add-strategy-definition-registry --strict`.
- [x] 5.4 Run `openspec validate define-strategy-platform-roadmap --strict`.
- [x] 5.5 Confirm no template markers or trailing whitespace remain in changed
      OpenSpec documents.
