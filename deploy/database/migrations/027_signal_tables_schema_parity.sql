-- Migration 027: 全链路同构硬门禁对齐（Signal Tables Schema Parity）
-- 1) strategy_signals 补齐 signal_type VARCHAR(32) NOT NULL DEFAULT 'signal'（解决对账脚本崩溃及细分形态丢失）
-- 2) backtest_signal_results 补齐 security_id, strategy_definition_id, strategy_version_id, period, source, signal_kind, signal_source
-- 3) backtest_runs 增加 prewarm_status, prewarm_min_actual, prewarm_min_expected
-- 4) 安全数据回填：
--    - backtest_signal_results.security_id 从 securities 表通过 security_code 回填
--    - backtest_signal_results 的 strategy_definition_id, strategy_version_id, period, source 从 backtest_runs 回填
--    - strategy_signals.signal_type 从 decision_trace 或 context_snapshot 回填
-- 5) 增加外键 fk_backtest_signal_results_security 约束到 securities(id)

-- 1. strategy_signals 增加 signal_type
ALTER TABLE `strategy_signals`
  ADD COLUMN `signal_type` varchar(32) NOT NULL DEFAULT 'signal' AFTER `signal_kind`;

-- 2. backtest_signal_results 增加缺失字段
ALTER TABLE `backtest_signal_results`
  ADD COLUMN `security_id` int NULL AFTER `backtest_run_id`,
  ADD COLUMN `strategy_definition_id` int NULL AFTER `security_id`,
  ADD COLUMN `strategy_version_id` int NULL AFTER `strategy_definition_id`,
  ADD COLUMN `period` int NULL AFTER `strategy_version_id`,
  ADD COLUMN `source` enum('ef', 'tdx', 'qmt') NULL AFTER `period`,
  ADD COLUMN `signal_kind` enum('entry', 'exit') NOT NULL DEFAULT 'entry' AFTER `signal_type`,
  ADD COLUMN `signal_source` enum('live', 'backtest') NOT NULL DEFAULT 'backtest' AFTER `signal_kind`;

-- 3. backtest_runs 增加预热诊断字段
ALTER TABLE `backtest_runs`
  ADD COLUMN `prewarm_status` enum('full', 'partial', 'empty') NULL AFTER `matched_security_count`,
  ADD COLUMN `prewarm_min_actual` int NULL AFTER `prewarm_status`,
  ADD COLUMN `prewarm_min_expected` int NULL AFTER `prewarm_min_actual`;

-- 4. 安全数据回填
-- 4.1 回填 backtest_signal_results.security_id
UPDATE `backtest_signal_results` bsr
JOIN `securities` s ON s.code = bsr.security_code
SET bsr.security_id = s.id
WHERE bsr.security_id IS NULL;

-- 4.2 回填 backtest_signal_results 定义、版本、周期与源
UPDATE `backtest_signal_results` bsr
JOIN `backtest_runs` br ON br.id = bsr.backtest_run_id
SET
  bsr.strategy_definition_id = br.strategy_definition_id,
  bsr.strategy_version_id = br.strategy_version_id,
  bsr.period = br.period,
  bsr.source = br.source
WHERE bsr.strategy_definition_id IS NULL;

-- 4.3 回填 strategy_signals.signal_type
UPDATE `strategy_signals`
SET `signal_type` = COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(`decision_trace`, '$.eventType')),
  JSON_UNQUOTE(JSON_EXTRACT(`context_snapshot`, '$.chanBsp.type')),
  JSON_UNQUOTE(JSON_EXTRACT(`decision_trace`, '$.signalTag')),
  JSON_UNQUOTE(JSON_EXTRACT(`context_snapshot`, '$.signalTag')),
  'signal'
)
WHERE `signal_type` = 'signal' AND (`decision_trace` IS NOT NULL OR `context_snapshot` IS NOT NULL);

-- 5. 增加外键约束
ALTER TABLE `backtest_signal_results`
  ADD CONSTRAINT `fk_backtest_signal_results_security`
  FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
