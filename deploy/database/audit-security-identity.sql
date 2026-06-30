SET NAMES utf8mb4;

SELECT
  `id`,
  `code`,
  `canonical_code`
FROM (
  SELECT
    `id`,
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
ORDER BY `id`;

SELECT
  `canonical_code`,
  COUNT(*) AS `row_count`,
  GROUP_CONCAT(CONCAT(`id`, ':', `code`) ORDER BY `id` SEPARATOR ',') AS `rows`
FROM (
  SELECT
    `id`,
    `code`,
    CASE
      WHEN UPPER(TRIM(`code`)) REGEXP '^[0-9]{6}\\.(SH|SZ|BJ)$'
        THEN SUBSTRING_INDEX(UPPER(TRIM(`code`)), '.', 1)
      WHEN UPPER(TRIM(`code`)) REGEXP '^(SH|SZ|BJ)[0-9]{6}$'
        THEN SUBSTRING(UPPER(TRIM(`code`)), 3)
      ELSE UPPER(TRIM(`code`))
    END AS `canonical_code`
  FROM `securities`
) AS `security_code_collision_audit`
GROUP BY `canonical_code`
HAVING COUNT(*) > 1
ORDER BY `canonical_code`;

SELECT
  `security_id`,
  `source`,
  COUNT(*) AS `row_count`,
  COUNT(DISTINCT CONCAT_WS('|', `formatCode`, `priority`, `enabled`)) AS `distinct_config_count`,
  GROUP_CONCAT(`id` ORDER BY `id` SEPARATOR ',') AS `ids`
FROM `security_source_configs`
GROUP BY `security_id`, `source`
HAVING COUNT(*) > 1
ORDER BY `security_id`, `source`;

SELECT
  `dup`.`id`,
  `dup`.`security_id`,
  `dup`.`source`,
  `dup`.`formatCode`,
  `dup`.`priority`,
  `dup`.`enabled`,
  `keep`.`id` AS `kept_id`
FROM `security_source_configs` AS `dup`
JOIN `security_source_configs` AS `keep`
  ON `keep`.`security_id` = `dup`.`security_id`
  AND `keep`.`source` = `dup`.`source`
  AND `keep`.`formatCode` = `dup`.`formatCode`
  AND `keep`.`priority` = `dup`.`priority`
  AND `keep`.`enabled` = `dup`.`enabled`
  AND `keep`.`id` < `dup`.`id`
ORDER BY `dup`.`security_id`, `dup`.`source`, `dup`.`id`;

SELECT
  `security_id`,
  `source`,
  COUNT(*) AS `row_count`,
  COUNT(DISTINCT CONCAT_WS('|', `formatCode`, `priority`, `enabled`)) AS `distinct_config_count`,
  GROUP_CONCAT(
    CONCAT(`id`, ':', `formatCode`, ':', `priority`, ':', `enabled`)
    ORDER BY `id`
    SEPARATOR ','
  ) AS `rows`
FROM `security_source_configs`
GROUP BY `security_id`, `source`
HAVING COUNT(*) > 1
  AND COUNT(DISTINCT CONCAT_WS('|', `formatCode`, `priority`, `enabled`)) > 1
ORDER BY `security_id`, `source`;
