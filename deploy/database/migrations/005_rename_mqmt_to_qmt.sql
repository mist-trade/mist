SET NAMES utf8mb4;

ALTER TABLE `security_source_configs`
  MODIFY COLUMN `source` enum('ef','tdx','mqmt','qmt') NOT NULL DEFAULT 'ef';
ALTER TABLE `k`
  MODIFY COLUMN `source` enum('ef','tdx','mqmt','qmt') NOT NULL DEFAULT 'ef';

UPDATE `security_source_configs` SET `source`='qmt' WHERE `source`='mqmt';
UPDATE `k` SET `source`='qmt' WHERE `source`='mqmt';

SET @has_mqmt_table := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_mqmt'
);
SET @has_qmt_table := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
);
SET @rename_qmt_sql := IF(
  @has_mqmt_table = 1 AND @has_qmt_table = 0,
  'RENAME TABLE `k_extensions_mqmt` TO `k_extensions_qmt`',
  'SELECT 1'
);
PREPARE rename_qmt_stmt FROM @rename_qmt_sql;
EXECUTE rename_qmt_stmt;
DEALLOCATE PREPARE rename_qmt_stmt;

ALTER TABLE `security_source_configs`
  MODIFY COLUMN `source` enum('ef','tdx','qmt') NOT NULL DEFAULT 'ef';
ALTER TABLE `k`
  MODIFY COLUMN `source` enum('ef','tdx','qmt') NOT NULL DEFAULT 'ef';

SET @qmt_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
    AND column_name = 'preClose'
);
SET @qmt_col_sql := IF(
  @qmt_col_exists = 0,
  'ALTER TABLE `k_extensions_qmt` ADD COLUMN `preClose` decimal(20,6) NULL',
  'SELECT 1'
);
PREPARE qmt_col_stmt FROM @qmt_col_sql;
EXECUTE qmt_col_stmt;
DEALLOCATE PREPARE qmt_col_stmt;

SET @qmt_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
    AND column_name = 'suspendFlag'
);
SET @qmt_col_sql := IF(
  @qmt_col_exists = 0,
  'ALTER TABLE `k_extensions_qmt` ADD COLUMN `suspendFlag` int NULL',
  'SELECT 1'
);
PREPARE qmt_col_stmt FROM @qmt_col_sql;
EXECUTE qmt_col_stmt;
DEALLOCATE PREPARE qmt_col_stmt;

SET @qmt_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
    AND column_name = 'openInterest'
);
SET @qmt_col_sql := IF(
  @qmt_col_exists = 0,
  'ALTER TABLE `k_extensions_qmt` ADD COLUMN `openInterest` decimal(20,4) NULL',
  'SELECT 1'
);
PREPARE qmt_col_stmt FROM @qmt_col_sql;
EXECUTE qmt_col_stmt;
DEALLOCATE PREPARE qmt_col_stmt;

SET @qmt_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
    AND column_name = 'settle'
);
SET @qmt_col_sql := IF(
  @qmt_col_exists = 0,
  'ALTER TABLE `k_extensions_qmt` ADD COLUMN `settle` decimal(20,6) NULL',
  'SELECT 1'
);
PREPARE qmt_col_stmt FROM @qmt_col_sql;
EXECUTE qmt_col_stmt;
DEALLOCATE PREPARE qmt_col_stmt;

SET @qmt_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
    AND column_name = 'effectiveDividendType'
);
SET @qmt_col_sql := IF(
  @qmt_col_exists = 0,
  'ALTER TABLE `k_extensions_qmt` ADD COLUMN `effectiveDividendType` varchar(32) NULL',
  'SELECT 1'
);
PREPARE qmt_col_stmt FROM @qmt_col_sql;
EXECUTE qmt_col_stmt;
DEALLOCATE PREPARE qmt_col_stmt;

SET @qmt_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'k_extensions_qmt'
    AND column_name = 'nativePeriod'
);
SET @qmt_col_sql := IF(
  @qmt_col_exists = 0,
  'ALTER TABLE `k_extensions_qmt` ADD COLUMN `nativePeriod` varchar(16) NULL',
  'SELECT 1'
);
PREPARE qmt_col_stmt FROM @qmt_col_sql;
EXECUTE qmt_col_stmt;
DEALLOCATE PREPARE qmt_col_stmt;
