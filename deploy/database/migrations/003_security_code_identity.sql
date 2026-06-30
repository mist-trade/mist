SET NAMES utf8mb4;

SET @non_canonical_security_codes = (
  SELECT COUNT(*)
  FROM (
    SELECT
      `code`,
      CASE
        WHEN UPPER(TRIM(`code`)) REGEXP '^[0-9]{6}\\.(SH|SZ|BJ)$'
          THEN SUBSTRING_INDEX(UPPER(TRIM(`code`)), '.', 1)
        WHEN UPPER(TRIM(`code`)) REGEXP '^(SH|SZ|BJ)[0-9]{6}$'
          THEN SUBSTRING(UPPER(TRIM(`code`)), 3)
        ELSE UPPER(TRIM(`code`))
      END AS `canonical_code`
    FROM `securities`
  ) AS `security_code_audit`
  WHERE `code` <> `canonical_code`
);

SET @assert_security_codes_sql = IF(
  @non_canonical_security_codes = 0,
  'SELECT 1 AS security_code_identity_ready',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Non-canonical securities.code rows exist; run deploy/database/audit-security-identity.sql and resolve manually'''
);

PREPARE stmt FROM @assert_security_codes_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELETE `dup`
FROM `security_source_configs` AS `dup`
JOIN `security_source_configs` AS `keep`
  ON `keep`.`security_id` = `dup`.`security_id`
  AND `keep`.`source` = `dup`.`source`
  AND `keep`.`formatCode` = `dup`.`formatCode`
  AND `keep`.`priority` = `dup`.`priority`
  AND `keep`.`enabled` = `dup`.`enabled`
  AND `keep`.`id` < `dup`.`id`;

SET @remaining_duplicate_source_configs = (
  SELECT COUNT(*)
  FROM (
    SELECT `security_id`, `source`
    FROM `security_source_configs`
    GROUP BY `security_id`, `source`
    HAVING COUNT(*) > 1
  ) AS `duplicate_source_configs`
);

SET @assert_source_configs_sql = IF(
  @remaining_duplicate_source_configs = 0,
  'SELECT 1 AS security_source_configs_ready',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Non-identical duplicate security_source_configs rows exist; run deploy/database/audit-security-identity.sql and resolve manually'''
);

PREPARE stmt FROM @assert_source_configs_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @source_config_unique_index_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'security_source_configs'
    AND `INDEX_NAME` = 'uq_security_source_configs_security_source'
);

SET @add_source_config_unique_index_sql = IF(
  @source_config_unique_index_exists = 0,
  'ALTER TABLE `security_source_configs` ADD UNIQUE KEY `uq_security_source_configs_security_source` (`security_id`, `source`)',
  'SELECT 1 AS security_source_configs_unique_index_exists'
);

PREPARE stmt FROM @add_source_config_unique_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
