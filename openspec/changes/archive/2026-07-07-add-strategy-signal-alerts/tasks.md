# Tasks: Add strategy signal alerts

## 1. Contract Tests

- [x] 1.1 Add rule evaluator tests for matching and non-matching declarative
      expressions over K-line/security context.
- [x] 1.2 Add scan service tests for enabled strategy evaluation, signal
      persistence, alert event persistence, and duplicate suppression.
- [x] 1.3 Add route/controller tests for `/v1/strategy-scans/run`.

## 2. Backend Implementation

- [x] 2.1 Add scan DTO and result types for operator-triggered scans.
- [x] 2.2 Add `StrategyEvaluationContextBuilder` for latest K-line/security
      context.
- [x] 2.3 Add pure `StrategyRuleEvaluator` used by scans and future backtests.
- [x] 2.4 Add `StrategyScanService` to load enabled strategies, evaluate
      current versions, persist signals, persist alert events, and skip
      duplicates.
- [x] 2.5 Add `StrategyScanController` under `/v1/strategy-scans`.
- [x] 2.6 Register scanner services/controllers in `StrategyModule`.

## 3. Documentation And Roadmap

- [x] 3.1 Update README strategy API table with the manual scan endpoint and
      current scope.
- [x] 3.2 Update strategy roadmap disposition to mark
      `add-strategy-signal-alerts` as created/in progress.

## 4. Verification

- [x] 4.1 Run focused strategy scan tests.
- [x] 4.2 Run TypeScript typecheck.
- [x] 4.3 Run focused ESLint on strategy/shared-data files.
- [x] 4.4 Run `openspec validate add-strategy-signal-alerts --strict`.
- [x] 4.5 Run `openspec validate define-strategy-platform-roadmap --strict`.
- [x] 4.6 Confirm no template markers or trailing whitespace remain in changed
      OpenSpec documents.
