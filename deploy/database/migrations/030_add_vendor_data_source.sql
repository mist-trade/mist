SET NAMES utf8mb4;

-- Preflight: the k.source column must already exist as an enum before widening it.
SET @k_source_column_type = (
  SELECT `COLUMN_TYPE`
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'k'
    AND `COLUMN_NAME` = 'source'
);

SET @assert_k_source_sql = IF(
  @k_source_column_type LIKE 'enum(%',
  'SELECT 1 AS vendor_source_preflight_ok',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''k.source is missing or not an enum; run deploy/database/audit-k-decimal-migration.sql first'''
);

PREPARE stmt FROM @assert_k_source_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 1. Vendor is one source per provider. vendor_a is the first third-party series.
--    Every table that records a replay source must accept it; strategy_signals and
--    security_source_configs stay narrow on purpose (live/collection never use vendor).
ALTER TABLE `k`
  MODIFY COLUMN `source` enum('ef','tdx','qmt','vendor_a') NOT NULL DEFAULT 'ef'
  COMMENT '数据源：ef=东方财富，tdx=通达信，qmt=大QMT，vendor_a=第三方A';

ALTER TABLE `backtest_runs`
  MODIFY COLUMN `source` enum('ef','tdx','qmt','vendor_a') NOT NULL DEFAULT 'ef';

-- backtest_signal_results is created by migration 027. On a database where 027 has
-- not been applied yet this block is a no-op; the file is re-run at deploy time after
-- 027 and widens the column then.
SET @has_backtest_signal_results_source = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'backtest_signal_results'
    AND `COLUMN_NAME` = 'source'
);

SET @widen_backtest_signal_results_sql = IF(
  @has_backtest_signal_results_source > 0,
  'ALTER TABLE `backtest_signal_results` MODIFY COLUMN `source` enum(''ef'',''tdx'',''qmt'',''vendor_a'') NULL',
  'SELECT 1 AS backtest_signal_results_absent'
);

PREPARE stmt FROM @widen_backtest_signal_results_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Numeric per-field quality. Validity flags are 0/1 so callers can compute
--    with them directly (volume * volume_valid * volume_scale). caliber_epoch
--    marks aggregation-basis segments: comparable inside an epoch, not across.
CREATE TABLE IF NOT EXISTS `k_quality` (
  `id` int NOT NULL AUTO_INCREMENT,
  `k_id` int NOT NULL,
  `open_valid` tinyint(1) NOT NULL DEFAULT 1,
  `high_valid` tinyint(1) NOT NULL DEFAULT 1,
  `low_valid` tinyint(1) NOT NULL DEFAULT 1,
  `close_valid` tinyint(1) NOT NULL DEFAULT 1,
  `volume_valid` tinyint(1) NOT NULL DEFAULT 1,
  `amount_valid` tinyint(1) NOT NULL DEFAULT 1,
  `volume_scale` decimal(20,8) NOT NULL DEFAULT 1,
  `amount_scale` decimal(20,8) NOT NULL DEFAULT 1,
  `caliber_epoch` smallint unsigned NOT NULL DEFAULT 1,
  `manual_fix` tinyint(1) NOT NULL DEFAULT 0,
  `derived_from_period` int NULL,
  `dataset_version` varchar(64) NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_k_quality_k_id` (`k_id`),
  CONSTRAINT `fk_k_quality_k`
    FOREIGN KEY (`k_id`) REFERENCES `k` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Postflight readback.
SELECT `TABLE_NAME`, `COLUMN_TYPE`
FROM `information_schema`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `COLUMN_NAME` = 'source'
  AND `TABLE_NAME` IN ('k', 'backtest_runs', 'backtest_signal_results');

SELECT COUNT(*) AS `k_quality_ready`
FROM `information_schema`.`TABLES`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'k_quality';
