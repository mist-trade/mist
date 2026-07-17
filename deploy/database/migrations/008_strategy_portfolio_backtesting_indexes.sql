-- Portfolio backtest query-index convergence.
-- This is intentionally additive migration 008: environments that already
-- recorded 007 in schema_migrations must never receive an edited 007 file.

ALTER TABLE `backtest_runs`
  ADD KEY `idx_backtest_runs_definition_created_id` (`strategy_definition_id`, `created_at`, `id`),
  ADD KEY `idx_backtest_runs_status_created_id` (`status`, `created_at`, `id`),
  DROP INDEX `idx_backtest_runs_status`;

ALTER TABLE `backtest_signals`
  DROP INDEX `idx_backtest_signal_results_run_id`;

ALTER TABLE `backtest_orders`
  DROP INDEX `idx_backtest_orders_run_id`,
  DROP INDEX `idx_backtest_orders_signal_id`;

ALTER TABLE `backtest_trades`
  DROP INDEX `idx_backtest_trades_run_id`;

ALTER TABLE `backtest_equity_points`
  DROP INDEX `idx_backtest_equity_points_run_time`;
