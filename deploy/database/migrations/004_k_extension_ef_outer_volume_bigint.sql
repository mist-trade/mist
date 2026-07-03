SET NAMES utf8mb4;

SET @outer_volume_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'k_extensions_ef'
    AND COLUMN_NAME = 'outerVolume'
);

SET @ddl = IF(
  @outer_volume_column_exists = 1,
  'ALTER TABLE `k_extensions_ef` MODIFY COLUMN `outerVolume` bigint NULL COMMENT ''外盘量''',
  'SELECT 1 AS k_extensions_ef_outer_volume_missing'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
