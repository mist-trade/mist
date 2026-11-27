-- 039: 为 strategy_alert_events 增加 (status, created_at) 复合索引以消除补扫查询全表扫描
CREATE INDEX `idx_strategy_alert_events_status_created`
  ON `strategy_alert_events` (`status`, `created_at`);
