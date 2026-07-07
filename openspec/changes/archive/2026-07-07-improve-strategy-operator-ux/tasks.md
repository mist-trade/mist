# Tasks: Improve strategy operator UX

## 1. Frontend API Contracts

- [x] 1.1 Add frontend API client tests proving strategy calls use
      `getMistApiBase()` and `/v1/*` strategy endpoints.
- [x] 1.2 Add TypeScript types for strategy definitions, versions, signals,
      alert events, scan results, backtest runs, and backtest signal results.
- [x] 1.3 Add strategy API client methods for registry, lifecycle, signals,
      alerts, manual scans, backtest creation, run detail, and backtest
      signals.
- [x] 1.4 Prove the strategy API client does not call datasource or raw
      provider base URLs.

## 2. Workspace Tests

- [x] 2.1 Add page tests proving `/strategies` renders registry, signals,
      alerts, and backtests workflow areas instead of a landing page.
- [x] 2.2 Add tests for loading and displaying strategy registry rows and
      selected strategy details.
- [x] 2.3 Add tests for parsing rule JSON, blocking malformed JSON, and showing
      backend validation errors.
- [x] 2.4 Add tests for create/update, enable, disable, alert acknowledgement,
      and manual scan actions.
- [x] 2.5 Add tests for creating a signal-level backtest and rendering
      aggregate run statistics plus signal rows.
- [x] 2.6 Add tests proving portfolio simulation fields are not required or
      rendered.

## 3. Workspace Implementation

- [x] 3.1 Create `../mist-fe/app/strategies/page.tsx` and a client workspace
      component under `../mist-fe/app/strategies/`.
- [x] 3.2 Implement a compact operator shell with registry, signals, alerts,
      and backtests tabs or sections.
- [x] 3.3 Implement strategy registry list, detail, version inspection,
      create/update-as-new-version, enable, and disable workflows.
- [x] 3.4 Implement explicit rule JSON editor behavior with parse errors and
      API errors.
- [x] 3.5 Implement signal history and alert event views with filters where
      supported by backend DTOs.
- [x] 3.6 Implement alert acknowledgement and manual scan actions with
      in-flight and result states.
- [x] 3.7 Implement signal-level backtest form, run summary, and persisted
      signal result table.
- [x] 3.8 Add a navigation affordance from the existing frontend surface to the
      strategy workspace.

## 4. Styling And UX Boundaries

- [x] 4.1 Add responsive, dense, operational styling consistent with the
      existing K-line page conventions.
- [x] 4.2 Ensure text does not overflow buttons, tabs, table cells, or compact
      panels at desktop and mobile widths.
- [x] 4.3 Keep page sections unframed or panel-based and avoid nested cards,
      landing heroes, and decorative-only visuals.
- [x] 4.4 Keep the backtest UI signal-level only with no portfolio, order,
      cash, fee, slippage, equity curve, or return fields.

## 5. Documentation And Roadmap

- [x] 5.1 Update `../mist-fe/README.md` or relevant frontend docs with the
      strategy workspace route and backend API base expectation.
- [x] 5.2 Update the root Mist README or strategy section if navigation or
      frontend usage changes operator-facing docs.
- [x] 5.3 Update `define-strategy-platform-roadmap` disposition for
      `improve-strategy-operator-ux`.

## 6. Verification

- [x] 6.1 Run focused frontend strategy API client tests.
- [x] 6.2 Run focused frontend strategy workspace tests.
- [x] 6.3 Run `pnpm test:ci` in `../mist-fe`.
- [x] 6.4 Run `pnpm typecheck` in `../mist-fe`.
- [x] 6.5 Run `pnpm lint` in `../mist-fe`.
- [x] 6.6 Run `pnpm build` in `../mist-fe`.
- [x] 6.7 Run `openspec validate improve-strategy-operator-ux --strict`.
- [x] 6.8 Run `openspec validate define-strategy-platform-roadmap --strict`.
- [x] 6.9 Confirm no template markers or trailing whitespace remain in changed
      OpenSpec and frontend files.
