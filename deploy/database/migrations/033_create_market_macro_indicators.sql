-- Migration 033: 创建全市场宏观与宽度指标表
-- 记录每日盘后计算的全市场CYS13超跌比例、站上MA250比例、全A换手率及10年分位、10年期国债收益率与股债性价比ERP

CREATE TABLE IF NOT EXISTS `market_macro_indicators` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `trading_date` date NOT NULL COMMENT '交易日 YYYY-MM-DD',
  `breadth_cys13_oversold_ratio` decimal(6, 4) NOT NULL COMMENT '全市场CYS13<-12%超跌比例 (0.0000 - 1.0000)',
  `breadth_above_ma250_ratio` decimal(6, 4) NOT NULL COMMENT '全市场站上MA250比例 (0.0000 - 1.0000)',
  `all_a_turnover_rate` decimal(8, 4) NULL COMMENT '全A当日换手率 (%)',
  `all_a_turnover_percentile_10y` decimal(6, 4) NULL COMMENT '全A换手率10年分位点 (0.0000 - 1.0000)',
  `china_10y_bond_yield` decimal(6, 4) NULL COMMENT '中国10年期国债到期收益率 (%)',
  `index_pe_ttm` decimal(8, 4) NULL COMMENT '中证全指/沪深300滚动市盈率 PE-TTM',
  `erp_ratio` decimal(8, 4) NULL COMMENT '股债性价比 ERP = 1/PE - 10Y国债收益率 (%)',
  `erp_percentile_10y` decimal(6, 4) NULL COMMENT 'ERP 10年分位点 (0.0000 - 1.0000)',
  `erp_zscore_10y` decimal(6, 4) NULL COMMENT 'ERP 10年 Z-Score 标准分',
  `sample_count` int unsigned NOT NULL DEFAULT 0 COMMENT '当日统计有效样本股票数',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_trading_date` (`trading_date`),
  KEY `idx_trading_date_erp` (`trading_date`, `erp_ratio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全市场宏观与宽度指标表';
