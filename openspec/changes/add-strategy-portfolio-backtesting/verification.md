# Verification Evidence

Verified on 2026-07-11 from the isolated backend and frontend worktrees.

## Automated checks

- Backend: `pnpm test:ci` — 63 suites, 430 tests passed.
- Backend: `pnpm typecheck`, `pnpm lint:check`, and `pnpm build` passed.
- Frontend: `pnpm test:ci` — 15 suites, 93 tests passed.
- Frontend: `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- `pnpm exec openspec validate add-strategy-portfolio-backtesting --strict`
  passed.

## MySQL and V1 API integration

- A disposable MySQL 8 container applied migrations `001` through `007` with
  the repository migration runner. The resulting schema contains the required
  snapshots, run status/stage enums, and `backtest_orders.expired_at` column.
- An eligible daily paired-rule strategy was created through `POST
  /v1/strategies`. `POST /v1/strategy-backtests` returned HTTP 202 with an
  immutable pending snapshot.
- The processor completed the run through the V1 API with 4 signals, 4 orders,
  1 closed trade, 4 equity points, metrics, and numeric decimal API fields.
- Immediate V1 cancellation produced a terminal `cancelled` run with zero
  facts. An expired leased run with injected partial facts was reclaimed,
  cleared, and completed on attempt 2. Its fact counts and total return matched
  the clean run exactly.

## Known model limitations

The product deliberately uses persisted forward-adjusted daily bars, next
available open execution, and full fills. It does not model dividends, splits,
rights issues, complete exchange price-limit behavior, ST rules, liquidity, or
partial fills. These limitations are retained in immutable run snapshots and
shown in the operator workspace.

## Remaining manual visual check

Focused React tests and the production frontend build pass. Direct visual
inspection at desktop and narrow widths remains pending because the in-app
browser blocks the local `localhost` reload under its URL policy; no bypass was
attempted.
