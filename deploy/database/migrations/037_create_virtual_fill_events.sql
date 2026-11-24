-- 037: 交易层事件溯源虚拟账本（2026-11-24，add-virtual-trading-layer）
-- 成交事实的单一事实源（REQ-LEDGER-01）：追加日志，账户快照 = fold(事件)。
-- unique(alert_event_id) 幂等锚点（REQ-LEDGER-03）：同一告警事件至多一条 fill，
-- 投递重试 / 幂等重放不二次回填。
-- 金额列 BIGINT 厘（1 元 = 1000 厘，REQ-ENGINE-07），价格列 DECIMAL(10,3)
-- （A 股 ≤3 位小数精确）。
-- 注：域内幂等键为字符串 idempotencyKey（实时 = alertEventId 字符串化，
-- 离线 = 合成幂等串）；本表仅承载实时路径的数值锚点，离线走内存日志。
CREATE TABLE IF NOT EXISTS `virtual_fill_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `alert_event_id` BIGINT UNSIGNED NOT NULL,
  `security_id` INT UNSIGNED NOT NULL,
  `security_code` VARCHAR(32) NOT NULL,
  `side` ENUM('BUY','SELL') NOT NULL,
  `quantity` INT UNSIGNED NOT NULL,
  `price` DECIMAL(10,3) NOT NULL,
  `fees` BIGINT NOT NULL DEFAULT 0,
  `net_amount` BIGINT NOT NULL,
  `trading_day` DATE NOT NULL,
  `instruction` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_virtual_fill_events_alert_event_id` (`alert_event_id`),
  KEY `idx_virtual_fill_events_security_day` (`security_id`, `trading_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
