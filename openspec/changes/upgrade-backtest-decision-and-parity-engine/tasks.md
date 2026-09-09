# Tasks: 量化回测决策状态机、严格 A 股撮合与防未来函数质检体系

## Phase 1: 策略决策与持仓状态机核心（`libs/strategy` & `libs/signal`）

- [ ] **1.1 策略出场配置契约与编译（全面吸收 Exit Trinity）**
  - 在 `libs/strategy` 中定义 `StrategyExitPolicy` 类型、校验规则与默认值（`structuralStop`, `breakEven`, `trailingStop`, `partialProfit`, `hardStopLossRatio`, `oppositeSignalExit`, `maxHoldingBars`）；
  - 支持 `structuralStop` 从决策流返回的 `evidence` 中读取结构止损点（兼容缠论中枢 `zd`、笔底、SMC 订单块与 FVG 下轨）；
  - 支持 `breakEven` 模式为 `1R`（浮盈达到 1 倍初始风险时止损线无条件拉至成本价）；
  - 扩展 `StrategyVersion` 实体支持 `exitPolicy` 配置解析与校验。
- [ ] **1.2 统一持仓状态机实现（`PositionStateMachine`）**
  - 状态机直接消费 `DecisionFlowEngine` 的 `DecisionResult`（`action === 'BUY'` 触发入场），剔除冗余内部入场过滤；
  - 实现状态机流转：`Empty` -> `PendingEntry` -> `Holding` -> (`PendingPartialExit` -> `Holding`) -> `PendingExit` -> `Closed`；
  - 维护持仓生命周期状态：`entryBar`, `costPrice`, `highWatermark`, `currentStopLossPrice`, `holdingBars`, `initialRiskR`；
  - 实现逐 Bar 出场判定算法（支持 Exit Trinity 优先级：硬止损 > 结构止损 > 移动追踪止盈 > 1R 动态保本 > 目标位分批减仓 50% > 决策流反向卖点 > 超时平仓）；
  - 编写状态机单元测试（100% 覆盖各类出场场景、1R 保本迁移与半仓分批止盈）。

---

## Phase 2: A 股严格撮合与回测执行器升级（`apps/backtest`）

- [ ] **2.1 A 股模拟撮合器（`SimulatedBroker`）**
  - 实现 Next-Bar Open 买入与卖出撮合；
  - 实现盘中触价止损模拟（考虑跳空低开情况）；
  - 实现 T+1 制度约束（当天不可卖出）；
  - 实现涨跌停无法成交（一字涨停买入拒绝、一字跌停卖出顺延）；
  - 实现佣金、过户费与滑点扣减，支持股票（0.05% 印花税）与 ETF（0% 免印花税）差异化税率。
- [ ] **2.2 回测执行器重构（`BacktestRunExecutor`）**
  - 重构 `replaySecurity`，将仅信号输出升级为 `DecisionFlowEngine + PositionStateMachine + SimulatedBroker` 闭环执行；
  - 计算每笔交易与分批平仓的 `BacktestTradeResult`（包含出场原因 `exitReason`、持仓天数、净收益率、R 倍数、手续费）；
  - 汇总统计量化绩效指标（总收益率、最大回撤、夏普比率、胜率、盈亏比、交易次数、平均持仓周期）。
- [ ] **2.3 数据库 Migration 022**
  - 新增 `backtest_trade_results` 表（支持 `is_partial` 半仓标记与 `pnl_r_multiple`）；
  - 在 `backtest_runs` 表中增加绩效统计指标字段（`total_return`, `max_drawdown`, `sharpe_ratio`, `win_rate`, `profit_loss_ratio`, `trade_count`）。

---

## Phase 3: 三维防未来函数质检与双轨对账体系

- [ ] **3.1 因果不变性断言框架（Causality Invariant Assertions）**
  - 在回放引擎中嵌入断言：所有输入时间戳 $\le t$，成交时间戳 $> t$，几何确认时刻 $\ge$ 极值点时刻。
- [ ] **3.2 未来数据扰动/注入防泄漏测试（Lookahead Leakage Test）**
  - 编写自动化测试：在任意时间点 $t$ 截断/扰动未来数据，断言在 $t$ 的信号与持仓决策 100% 不变。
- [ ] **3.3 实时 vs 回测双轨 Parity 测试套件（Parity Replay Suite）**
  - 选取黄金历史样本（如茅台、300ETF 等多周期数据）；
  - 同时运行 `Signal App`（在线 BullMQ 推流）与 `Backtest App`（离线 K 线批处理）；
  - 断言产生的所有 Signal 与 Trade 决策 100% 逐字逐时间戳对齐。

---

## Phase 4: Web 审计控制台与 TDX/QMT 回写协同

- [ ] **4.1 Web 控制台 API 与页面适配（`mist` & `mist-fe`）**
  - 后端提供 `GET /v1/strategy/backtest-runs/:id/trades` 逐笔流水接口与绩效概览；
  - Web 端展示回测绩效卡片、逐笔 Trade 明细表（带出场归因标签与分批平仓状态）与因果质检状态报告。
- [ ] **4.2 原生终端绘图指令适配（`integrate-native-terminal-visualization`）**
  - 将回测生成的 Trade 序列映射为通用绘图指令（买入 Pin 标、卖出 Pin 标、持仓连接线、动态止损警戒线与分批止盈标记）；
  - 验证 QMT / TDX 客户端一键加载并极速复盘回测交易轨迹。
