SET NAMES utf8mb4;

-- Backtest drawdown duration: longest consecutive underwater trading-day run
-- of the combined NAV series (same basis as max_drawdown).
ALTER TABLE `backtest_runs`
  ADD COLUMN `max_underwater_duration` int NULL COMMENT '最长连续 underwater 交易日数；与 max_drawdown 同源（合成组合 NAV）' AFTER `max_drawdown`;

-- Postflight readback.
SELECT COUNT(*) AS runs_total,
       COUNT(`max_underwater_duration`) AS runs_with_duration
FROM `backtest_runs`;
