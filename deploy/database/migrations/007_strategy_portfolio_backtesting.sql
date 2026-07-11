SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `strategy_definitions`
  ADD COLUMN `backtest_enabled` tinyint(1) NOT NULL DEFAULT 0 AFTER `status`;

ALTER TABLE `strategy_versions`
  CHANGE COLUMN `rule` `entry_rule` json NOT NULL,
  ADD COLUMN `exit_rule` json NULL AFTER `entry_rule`,
  ADD COLUMN `lookback_bars` int NOT NULL DEFAULT 1 AFTER `exit_rule`;

ALTER TABLE `strategy_signals`
  ADD COLUMN `signal_kind` enum('entry', 'exit') NOT NULL DEFAULT 'entry' AFTER `signal_source`,
  ADD KEY `idx_strategy_signals_kind_time` (`signal_kind`, `signal_time`);

UPDATE `strategy_alert_events`
SET `dedupe_key` = CONCAT(`dedupe_key`, ':entry')
WHERE `dedupe_key` NOT LIKE '%:entry'
  AND `dedupe_key` NOT LIKE '%:exit';

DELETE FROM `backtest_signal_results`;
DELETE FROM `backtest_runs`;

RENAME TABLE `backtest_signal_results` TO `backtest_signals`;

ALTER TABLE `backtest_signals`
  DROP FOREIGN KEY `fk_backtest_signal_results_definition`,
  DROP FOREIGN KEY `fk_backtest_signal_results_version`;

ALTER TABLE `backtest_runs`
  MODIFY COLUMN `status` enum('pending', 'running', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  ADD COLUMN `strategy_snapshot` json NOT NULL AFTER `strategy_version_id`,
  ADD COLUMN `config_snapshot` json NOT NULL AFTER `source`,
  ADD COLUMN `stage` enum('queued', 'loading_data', 'simulating', 'finalizing') NOT NULL DEFAULT 'queued' AFTER `status`,
  ADD COLUMN `processed_work` int NOT NULL DEFAULT 0 AFTER `stage`,
  ADD COLUMN `total_work` int NOT NULL DEFAULT 0 AFTER `processed_work`,
  ADD COLUMN `progress_percent` decimal(5,2) NOT NULL DEFAULT 0.00 AFTER `total_work`,
  ADD COLUMN `lease_owner` varchar(120) NULL AFTER `progress_percent`,
  ADD COLUMN `lease_expires_at` datetime NULL AFTER `lease_owner`,
  ADD COLUMN `lease_heartbeat_at` datetime NULL AFTER `lease_expires_at`,
  ADD COLUMN `attempt_count` int NOT NULL DEFAULT 0 AFTER `lease_heartbeat_at`,
  ADD COLUMN `cancel_requested_at` datetime NULL AFTER `attempt_count`,
  ADD COLUMN `metrics` json NULL AFTER `cancel_requested_at`,
  ADD COLUMN `error_code` varchar(120) NULL AFTER `error_message`,
  ADD COLUMN `error_details` json NULL AFTER `error_code`,
  ADD KEY `idx_backtest_runs_definition_created` (`strategy_definition_id`, `created_at`),
  ADD KEY `idx_backtest_runs_lease` (`status`, `lease_expires_at`);

ALTER TABLE `backtest_signals`
  ADD COLUMN `signal_kind` enum('entry', 'exit') NOT NULL DEFAULT 'entry' AFTER `source`,
  ADD KEY `idx_backtest_signals_run_time` (`backtest_run_id`, `signal_time`),
  ADD UNIQUE KEY `uq_backtest_signals_run_security_time_kind` (`backtest_run_id`, `security_code`, `signal_time`, `signal_kind`);

CREATE TABLE IF NOT EXISTS `backtest_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backtest_run_id` int NOT NULL,
  `backtest_signal_id` int NULL,
  `security_code` varchar(20) NOT NULL,
  `side` enum('buy', 'sell') NOT NULL,
  `status` enum('pending', 'filled', 'rejected', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
  `reason` varchar(255) NULL,
  `scheduled_time` datetime NOT NULL,
  `execution_time` datetime NULL,
  `expired_at` datetime NULL,
  `quantity` int NOT NULL DEFAULT 0,
  `fill_price` decimal(20,2) NULL,
  `gross_amount` decimal(20,2) NULL,
  `commission` decimal(20,2) NOT NULL DEFAULT 0.00,
  `stamp_duty` decimal(20,2) NOT NULL DEFAULT 0.00,
  `transfer_fee` decimal(20,2) NOT NULL DEFAULT 0.00,
  `total_fee` decimal(20,2) NOT NULL DEFAULT 0.00,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_backtest_orders_signal_id` (`backtest_signal_id`),
  KEY `idx_backtest_orders_run_id` (`backtest_run_id`),
  KEY `idx_backtest_orders_run_execution_time` (`backtest_run_id`, `execution_time`),
  KEY `idx_backtest_orders_signal_id` (`backtest_signal_id`),
  CONSTRAINT `fk_backtest_orders_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_backtest_orders_signal`
    FOREIGN KEY (`backtest_signal_id`) REFERENCES `backtest_signals` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backtest_trades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backtest_run_id` int NOT NULL,
  `security_code` varchar(20) NOT NULL,
  `status` enum('open', 'closed') NOT NULL DEFAULT 'open',
  `entry_order_id` int NOT NULL,
  `exit_order_id` int NULL,
  `entry_time` datetime NOT NULL,
  `exit_time` datetime NULL,
  `entry_price` decimal(20,2) NOT NULL,
  `exit_price` decimal(20,2) NULL,
  `quantity` int NOT NULL,
  `entry_fee` decimal(20,2) NOT NULL DEFAULT 0.00,
  `exit_fee` decimal(20,2) NOT NULL DEFAULT 0.00,
  `realized_pnl` decimal(20,2) NULL,
  `holding_days` int NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_backtest_trades_entry_order_id` (`entry_order_id`),
  KEY `idx_backtest_trades_run_id` (`backtest_run_id`),
  KEY `idx_backtest_trades_run_security` (`backtest_run_id`, `security_code`),
  CONSTRAINT `fk_backtest_trades_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backtest_equity_points` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backtest_run_id` int NOT NULL,
  `point_time` datetime NOT NULL,
  `cash` decimal(20,2) NOT NULL,
  `market_value` decimal(20,2) NOT NULL,
  `equity` decimal(20,2) NOT NULL,
  `benchmark_value` decimal(20,2) NULL,
  `drawdown` decimal(12,8) NOT NULL DEFAULT 0.00000000,
  `exposure` decimal(12,8) NOT NULL DEFAULT 0.00000000,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_backtest_equity_points_run_time` (`backtest_run_id`, `point_time`),
  KEY `idx_backtest_equity_points_run_time` (`backtest_run_id`, `point_time`),
  CONSTRAINT `fk_backtest_equity_points_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
