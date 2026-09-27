-- 026: 统一策略求值管线（unify-strategy-evaluation-pipeline）
-- 1) 双时间戳契约落盘：backtest_signal_results / strategy_signals 增加 pivot_time
--    （形态几何极值时刻，图表 Marker 定位用；signal_time 保持决策触发语义）。
-- 2) 存量回填 pivot_time = signal_time：前端 pivotTime 回退逻辑下 Marker 位置与
--    迁移前完全等价，新写入按真实 pivot 语义。
-- 3) 停用存量 chan_bsp 策略定义（kind 已退役，独立执行分支删除；数据保留可审计，
--    恢复使用需转换为 decision_flow 定义）。回滚（如确需）：
--    UPDATE strategy_definitions SET status='enabled' WHERE kind='chan_bsp';
--    新写入的 signalTime 语义与旧数据不同，勿盲目回滚。

ALTER TABLE backtest_signal_results ADD COLUMN pivot_time DATETIME NULL;
ALTER TABLE strategy_signals ADD COLUMN pivot_time DATETIME NULL;

UPDATE backtest_signal_results SET pivot_time = signal_time WHERE pivot_time IS NULL;
UPDATE strategy_signals SET pivot_time = signal_time WHERE pivot_time IS NULL;

UPDATE strategy_definitions SET status = 'disabled' WHERE kind = 'chan_bsp';
