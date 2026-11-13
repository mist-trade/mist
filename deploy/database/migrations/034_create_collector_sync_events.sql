-- Migration 034: 创建采集器同步审计与对账事件表
-- 记录边缘端生命周期驱动推送的各标的周期 K 线入库及 4 级全景校验结果

CREATE TABLE IF NOT EXISTS `collector_sync_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source` VARCHAR(32) NOT NULL COMMENT 'tdx | qmt',
  `security_id` INT UNSIGNED NOT NULL,
  `symbol` VARCHAR(32) NOT NULL,
  `period` VARCHAR(16) NOT NULL,
  `bars_received` INT NOT NULL DEFAULT 0,
  `bars_saved` INT NOT NULL DEFAULT 0,
  `start_time` VARCHAR(32) DEFAULT NULL,
  `end_time` VARCHAR(32) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL COMMENT 'SUCCESS | FAILED | REJECTED',
  `verification_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING | PASSED | FAILED',
  `error_message` TEXT DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `idx_sync_events_source_time` (`source`, `created_at`),
  INDEX `idx_sync_events_security_period` (`security_id`, `period`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采集器同步审计与对账事件表';
