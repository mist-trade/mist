SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `strategy_definitions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `description` text NULL,
  `status` enum('draft', 'enabled', 'disabled', 'archived') NOT NULL DEFAULT 'draft',
  `target_universe` json NOT NULL,
  `periods` json NOT NULL,
  `sources` json NOT NULL,
  `current_version_id` int NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_strategy_definitions_status` (`status`),
  KEY `idx_strategy_definitions_current_version_id` (`current_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `strategy_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_definition_id` int NOT NULL,
  `version_number` int NOT NULL,
  `rule_schema_version` enum('v1') NOT NULL DEFAULT 'v1',
  `rule` json NOT NULL,
  `validation_summary` json NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_strategy_versions_definition_version` (`strategy_definition_id`, `version_number`),
  KEY `idx_strategy_versions_definition_id` (`strategy_definition_id`),
  CONSTRAINT `fk_strategy_versions_definition`
    FOREIGN KEY (`strategy_definition_id`) REFERENCES `strategy_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `strategy_signals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_definition_id` int NOT NULL,
  `strategy_version_id` int NOT NULL,
  `security_code` varchar(20) NOT NULL,
  `period` int NOT NULL,
  `source` enum('ef', 'tdx', 'qmt') NOT NULL,
  `signal_time` datetime NOT NULL,
  `signal_source` enum('live', 'backtest') NOT NULL,
  `context_snapshot` json NULL,
  `rule_snapshot` json NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_strategy_signals_definition_time` (`strategy_definition_id`, `signal_time`),
  KEY `idx_strategy_signals_security_time` (`security_code`, `signal_time`),
  KEY `idx_strategy_signals_version_id` (`strategy_version_id`),
  CONSTRAINT `fk_strategy_signals_definition`
    FOREIGN KEY (`strategy_definition_id`) REFERENCES `strategy_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_strategy_signals_version`
    FOREIGN KEY (`strategy_version_id`) REFERENCES `strategy_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `strategy_alert_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_signal_id` int NOT NULL,
  `status` enum('pending', 'delivered', 'acked', 'failed') NOT NULL DEFAULT 'pending',
  `dedupe_key` varchar(255) NOT NULL,
  `cooldown_until` datetime NULL,
  `delivery_result` json NULL,
  `acknowledged_at` datetime NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_strategy_alert_events_dedupe_key` (`dedupe_key`),
  KEY `idx_strategy_alert_events_signal_id` (`strategy_signal_id`),
  KEY `idx_strategy_alert_events_status` (`status`),
  CONSTRAINT `fk_strategy_alert_events_signal`
    FOREIGN KEY (`strategy_signal_id`) REFERENCES `strategy_signals` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backtest_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_definition_id` int NOT NULL,
  `strategy_version_id` int NOT NULL,
  `target_universe` json NOT NULL,
  `period` int NOT NULL,
  `source` enum('ef', 'tdx', 'qmt') NOT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `status` enum('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `signal_count` int NOT NULL DEFAULT 0,
  `matched_security_count` int NOT NULL DEFAULT 0,
  `started_at` datetime NULL,
  `completed_at` datetime NULL,
  `error_message` text NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_backtest_runs_strategy_version_id` (`strategy_version_id`),
  KEY `idx_backtest_runs_status` (`status`),
  CONSTRAINT `fk_backtest_runs_definition`
    FOREIGN KEY (`strategy_definition_id`) REFERENCES `strategy_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_backtest_runs_version`
    FOREIGN KEY (`strategy_version_id`) REFERENCES `strategy_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backtest_signal_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backtest_run_id` int NOT NULL,
  `strategy_definition_id` int NOT NULL,
  `strategy_version_id` int NOT NULL,
  `security_code` varchar(20) NOT NULL,
  `period` int NOT NULL,
  `source` enum('ef', 'tdx', 'qmt') NOT NULL,
  `signal_time` datetime NOT NULL,
  `context_snapshot` json NULL,
  `rule_snapshot` json NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_backtest_signal_results_run_id` (`backtest_run_id`),
  KEY `idx_backtest_signal_results_security_time` (`security_code`, `signal_time`),
  CONSTRAINT `fk_backtest_signal_results_run`
    FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_backtest_signal_results_definition`
    FOREIGN KEY (`strategy_definition_id`) REFERENCES `strategy_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_backtest_signal_results_version`
    FOREIGN KEY (`strategy_version_id`) REFERENCES `strategy_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
