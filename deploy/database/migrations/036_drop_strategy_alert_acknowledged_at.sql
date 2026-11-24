-- 036: 移除人工确认告警功能（2026-11-24）
-- 人工确认链路（ack 端点 / acknowledge 服务 / ACKED 状态 / acknowledged_at 列）整体退役：
-- 用户主要通过飞书消费告警，Web 端确认按钮从未参与实际运维流程。
-- ACKED 状态从未在确认链路之外被写入，可直接从枚举中移除。
ALTER TABLE `strategy_alert_events` DROP COLUMN `acknowledged_at`;
ALTER TABLE `strategy_alert_events` MODIFY COLUMN `status` enum('pending', 'delivered', 'failed') NOT NULL DEFAULT 'pending';
