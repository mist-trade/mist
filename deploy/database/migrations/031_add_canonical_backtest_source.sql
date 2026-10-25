SET NAMES utf8mb4;

-- 1. Backtest runs may now be assembled from the external splice policy.
--    `canonical` is a marker, never a physical k.source value.
ALTER TABLE `backtest_runs`
  MODIFY COLUMN `source` enum('ef','tdx','qmt','vendor_a','canonical') NOT NULL DEFAULT 'ef';

-- 2. Reproducibility: which policy version produced the run.
ALTER TABLE `backtest_runs`
  ADD COLUMN `data_policy_version` varchar(64) NULL COMMENT '拼接策略版本；canonical 回测必填，旧 run 为空' AFTER `source`;

-- 3. Postflight readback.
SELECT `COLUMN_TYPE` AS `backtest_source_type`
FROM `information_schema`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'backtest_runs'
  AND `COLUMN_NAME` = 'source';

SELECT COUNT(*) AS `data_policy_version_ready`
FROM `information_schema`.`COLUMNS`
WHERE `TABLE_SCHEMA` = DATABASE()
  AND `TABLE_NAME` = 'backtest_runs'
  AND `COLUMN_NAME` = 'data_policy_version';
