-- Migration 025: Add signal_type column and expand unique constraint
-- Allows multiple distinct signal types (e.g. 2nd and 3rd Chan buy points) on the same K-line / timestamp.

-- 1. Add signal_type column to backtest_signal_results
ALTER TABLE `backtest_signal_results`
  ADD COLUMN `signal_type` VARCHAR(32) NOT NULL DEFAULT 'signal' AFTER `signal_time`;

-- 2. Drop legacy business unique constraint (use primary key id as unique identity)
ALTER TABLE `backtest_signal_results`
  DROP INDEX `uq_backtest_signal_results_run_security_time`;

-- 4. Backfill existing historical records from JSON attributes if available
UPDATE `backtest_signal_results`
SET `signal_type` = COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(`decision_trace`, '$.eventType')),
  JSON_UNQUOTE(JSON_EXTRACT(`context_snapshot`, '$.chanBsp.type')),
  JSON_UNQUOTE(JSON_EXTRACT(`decision_trace`, '$.signalTag')),
  JSON_UNQUOTE(JSON_EXTRACT(`context_snapshot`, '$.signalTag')),
  'signal'
)
WHERE `signal_type` = 'signal' AND (`decision_trace` IS NOT NULL OR `context_snapshot` IS NOT NULL);
