-- Migration 029: backtest_runs 扩展净值时序与回测套件元数据
ALTER TABLE `backtest_runs`
  ADD COLUMN `nav_series` json NULL COMMENT '每日净值时序快照' AFTER `trade_count`,
  ADD COLUMN `benchmark_code` varchar(32) NULL COMMENT '对齐基准代码' AFTER `nav_series`,
  ADD COLUMN `parent_run_id` int NULL COMMENT '父级回测运行ID' AFTER `benchmark_code`,
  ADD COLUMN `suite_id` varchar(64) NULL COMMENT '回测套件批次唯一标识' AFTER `parent_run_id`,
  ADD COLUMN `stage` varchar(32) NULL COMMENT '回测阶段（如 TRAIN/TEST/FULL）' AFTER `suite_id`,
  ADD COLUMN `scenario_id` varchar(64) NULL COMMENT '压力测试场景标识' AFTER `stage`,
  ADD COLUMN `context_snapshot` json NULL COMMENT '套件或上下文配置快照' AFTER `scenario_id`,
  ADD KEY `idx_btr_suite` (`suite_id`, `stage`),
  ADD CONSTRAINT `fk_btr_parent_run` FOREIGN KEY (`parent_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE;
