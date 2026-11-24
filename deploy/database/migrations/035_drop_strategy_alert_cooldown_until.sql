-- 035: 时间字段收敛（2026-11-23）
-- `cooldown_until` 从未写入非空值，也无任何消费方；删除该列，避免告警模型继续携带
-- 一个不参与语义的时间字段。若未来需要冷却，应由独立功能重新引入并带明确语义。
ALTER TABLE `strategy_alert_events` DROP COLUMN `cooldown_until`;
