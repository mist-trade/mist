SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `securities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(20) NOT NULL,
  `name` varchar(100) NOT NULL,
  `type` enum('STOCK', 'INDEX') NOT NULL DEFAULT 'STOCK',
  `status` tinyint NOT NULL DEFAULT 1,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_securities_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `security_source_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `security_id` int NOT NULL,
  `source` enum('ef', 'tdx', 'mqmt') NOT NULL DEFAULT 'ef',
  `formatCode` varchar(50) NOT NULL,
  `priority` int NOT NULL DEFAULT 0,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_security_source_configs_security_id` (`security_id`),
  CONSTRAINT `fk_security_source_configs_security`
    FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `k` (
  `id` int NOT NULL AUTO_INCREMENT,
  `securityId` int NOT NULL,
  `source` enum('ef', 'tdx', 'mqmt') NOT NULL DEFAULT 'ef',
  `period` int NOT NULL DEFAULT 1440,
  `timestamp` datetime NOT NULL,
  `open` decimal(20,2) NOT NULL,
  `high` decimal(20,2) NOT NULL,
  `low` decimal(20,2) NOT NULL,
  `close` decimal(20,2) NOT NULL,
  `volume` bigint NOT NULL,
  `amount` decimal(20,2) NOT NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_k_security_source_period_timestamp` (`securityId`, `source`, `period`, `timestamp`),
  KEY `idx_k_security_id` (`securityId`),
  KEY `idx_k_timestamp` (`timestamp`),
  CONSTRAINT `fk_k_security`
    FOREIGN KEY (`securityId`) REFERENCES `securities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `k_extensions_ef` (
  `id` int NOT NULL AUTO_INCREMENT,
  `k_id` int NOT NULL,
  `fullCode` varchar(20) NULL,
  `amplitude` decimal(10,2) NULL,
  `changePct` decimal(10,2) NULL,
  `changeAmt` decimal(12,3) NULL,
  `turnoverRate` decimal(10,2) NULL,
  `volumeCount` bigint NULL,
  `innerVolume` bigint NULL,
  `outerVolume` decimal(20,0) NULL,
  `prevClose` decimal(12,3) NULL,
  `prevOpen` decimal(12,3) NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_k_extensions_ef_k_id` (`k_id`),
  CONSTRAINT `fk_k_extensions_ef_k`
    FOREIGN KEY (`k_id`) REFERENCES `k` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `k_extensions_tdx` (
  `id` int NOT NULL AUTO_INCREMENT,
  `k_id` int NOT NULL,
  `fullCode` varchar(20) NULL,
  `forwardFactor` decimal(16,8) NULL,
  `backwardFactor` decimal(16,8) NULL,
  `volumeRatio` decimal(10,2) NULL,
  `turnoverRate` decimal(10,2) NULL,
  `turnoverAmount` decimal(20,2) NULL,
  `totalMarketValue` decimal(20,2) NULL,
  `floatMarketValue` decimal(20,2) NULL,
  `earningsPerShare` decimal(10,2) NULL,
  `priceEarningsRatio` decimal(8,2) NULL,
  `priceToBookRatio` decimal(6,2) NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_k_extensions_tdx_k_id` (`k_id`),
  CONSTRAINT `fk_k_extensions_tdx_k`
    FOREIGN KEY (`k_id`) REFERENCES `k` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `k_extensions_mqmt` (
  `id` int NOT NULL AUTO_INCREMENT,
  `k_id` int NOT NULL,
  `fullCode` varchar(20) NULL,
  `create_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `update_time` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_k_extensions_mqmt_k_id` (`k_id`),
  CONSTRAINT `fk_k_extensions_mqmt_k`
    FOREIGN KEY (`k_id`) REFERENCES `k` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
