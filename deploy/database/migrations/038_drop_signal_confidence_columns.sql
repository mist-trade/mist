-- 038: 物理移除信号置信度列（confidence / confidence_level）并停用含废弃字段的旧策略定义
-- 交易引擎已收口为先出后进 + 同向归并，决策流移除 minConfidence 与 CONSENSUS，
-- 编译边界严格 fail-closed（零兼容忽略），历史 strategy_versions 保留不可变审计记录。

ALTER TABLE `strategy_signals`
  DROP COLUMN `confidence`,
  DROP COLUMN `confidence_level`;

ALTER TABLE `backtest_signal_results`
  DROP COLUMN `confidence`,
  DROP COLUMN `confidence_level`;

UPDATE `strategy_definitions` d
INNER JOIN `strategy_versions` v ON d.`current_version_id` = v.`id`
SET d.`status` = 'disabled'
WHERE d.`kind` = 'decision_flow'
  AND d.`status` = 'enabled'
  AND (
    JSON_CONTAINS_PATH(v.`rule`, 'one', '$**.minConfidence') = 1
    OR JSON_SEARCH(v.`rule`, 'one', 'CONSENSUS', NULL, '$**.type') IS NOT NULL
  );
