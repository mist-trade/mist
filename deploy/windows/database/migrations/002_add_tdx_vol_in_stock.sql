SET NAMES utf8mb4;

SET @column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'k_extensions_tdx'
    AND COLUMN_NAME = 'volInStock'
);

SET @ddl = IF(
  @column_exists = 0,
  'ALTER TABLE `k_extensions_tdx` ADD COLUMN `volInStock` decimal(20,2) NULL COMMENT ''流通股本：TDX VolInStock 字段'' AFTER `forwardFactor`',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
