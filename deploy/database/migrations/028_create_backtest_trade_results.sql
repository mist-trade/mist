-- Migration 028: 创建回测交易事实表与回测运行指标扩展
-- 1) backtest_runs 扩展量化绩效指标列（累计收益率、年化收益率、最大回撤、夏普比率、卡玛比率、胜率、盈亏比、成交笔数）
-- 2) 创建 backtest_trade_results 表（记录回测闭环交易流水：开平仓时刻、价格、盈亏、持仓 K 线数、出场原因）
-- 3) 建立外键关联与高效查询索引

-- 1. backtest_runs 扩展绩效汇总字段
ALTER TABLE `backtest_runs`
  ADD COLUMN `total_return` decimal(10, 4) NULL COMMENT '累计收益率' AFTER `matched_security_count`,
  ADD COLUMN `annualized_return` decimal(10, 4) NULL COMMENT '年化收益率' AFTER `total_return`,
  ADD COLUMN `max_drawdown` decimal(10, 4) NULL COMMENT '最大回撤' AFTER `annualized_return`,
  ADD COLUMN `sharpe_ratio` decimal(10, 4) NULL COMMENT '年化夏普比率' AFTER `max_drawdown`,
  ADD COLUMN `calmar_ratio` decimal(10, 4) NULL COMMENT '卡玛比率' AFTER `sharpe_ratio`,
  ADD COLUMN `win_rate` decimal(10, 4) NULL COMMENT '交易胜率' AFTER `calmar_ratio`,
  ADD COLUMN `profit_loss_ratio` decimal(10, 4) NULL COMMENT '盈亏比' AFTER `win_rate`,
  ADD COLUMN `trade_count` int NOT NULL DEFAULT 0 COMMENT '总模拟成交笔数' AFTER `profit_loss_ratio`;

-- 2. 创建 backtest_trade_results 回测闭环交易事实表
CREATE TABLE IF NOT EXISTS `backtest_trade_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backtest_run_id` int NOT NULL,
  `security_id` int NULL,
  `security_code` varchar(32) NOT NULL,
  `entry_time` datetime NOT NULL,
  `exit_time` datetime NOT NULL,
  `holding_bars` int NOT NULL DEFAULT 0,
  `entry_price` decimal(18, 4) NOT NULL,
  `exit_price` decimal(18, 4) NOT NULL,
  `quantity` int NOT NULL,
  `realized_pnl` decimal(18, 4) NOT NULL,
  `return_ratio` decimal(10, 4) NOT NULL,
  `exit_reason` varchar(64) NOT NULL DEFAULT 'SIGNAL_EXIT',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_btr_run_security` (`backtest_run_id`, `security_code`),
  KEY `idx_btr_entry_time` (`entry_time`),
  CONSTRAINT `fk_btr_run` FOREIGN KEY (`backtest_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_btr_security` FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
