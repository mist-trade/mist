# Proposal: 量化回测决策状态机、严格 A 股撮合与防未来函数质检体系

## 1. 背景与核心痛点

在系统完成 `add-factor-plugin-decision-flow-architecture` 重构并建立 `docs/factor-framework-and-alpha-architecture.md` 后，上层决策大脑已经实现了由 `DecisionFlowEngine` 统一驱动的树状流计算（支持门禁短路、状态路由、特征提取与局部加权共识），但在执行层与回测层仍面临以下核心痛点：

1. **“决策大脑”与“持仓执行手脚”脱节（信号 ≠ 真实可成交）**：
   - 树状决策流是无状态的纯函数分析器，每根 K 线只负责输出即时观点（`DecisionResult: BUY | SELL | ABORT` 及置信度和证据链）。系统缺乏一个维护从“买入挂单 → 持仓跟踪 → 动态保本/止损/分批止盈 → 平仓出场”的**统一持仓状态机（PositionStateMachine）**，导致策略无法管理真实账户持仓。
2. **缺乏标准化的出局三部曲闭环（Exit Trinity 落地缺失）**：
   - 在 `factor-framework-and-alpha-architecture.md` 中，我们为波段策略设计了严谨的 **Exit Trinity（出局三部曲）**（初始结构止损、1R 保本损转移、目标位分批减仓 50% 与 Trailing Stop 移动跟踪）。当前系统缺乏这一出场契约与状态流转，策略在形态破坏或达到目标位后无法自动触发止损止盈。
3. **潜在未来函数（Lookahead Bias）与确认时延混淆**：
   - 缠论笔、中枢或 SMC 订单块的几何极值点在历史 $t_0$ 发生，但该形态的**确认时刻（Confirmation Bar）**是在 $t_0 + k$。若在 $t_0$ 记录成交，即构成严重未来函数。
   - 缺乏强制执行的 **Next-Bar Open 成交** 与 **日内触价止损** 因果时序保障。
4. **后台运行结果缺乏可信的质检与对账手段**：
   - 回测在后台静默运行，用户无法直观验证回测逻辑是否包含未来函数，也缺乏“实时推流 vs 离线回测”的自动化双轨对账（Parity Replay）机制。

---

## 2. 目标与范围（Scope & Goals）

### 2.1 核心目标

1. **统一策略决策与持仓生命周期状态机（PositionStateMachine）**：
   - 在 `libs/strategy` / `libs/signal` 中构建通用的持仓状态机，**回测与实盘 100% 共用同一套状态流转与持仓逻辑**；
   - 彻底解耦职责：状态机不再重复执行入场过滤（入场门禁已收口在 `DecisionFlowEngine`），直接消费 `DecisionResult`；
   - 严格维护 `Empty` → `PendingEntry` → `Holding` → `PendingExit` → `Closed` 的状态迁移。
2. **全量支持 Exit Trinity（出局三部曲）的多层出场策略契约（`StrategyExitPolicy`）**：
   - **通用结构止损**：动态从决策流返回的 `evidence` 中读取结构止损价（支持缠论中枢 `zd`、笔底、SMC 订单块 `order_block` 下轨、FVG 缺口下轨或 ATR 轨）；
   - **1R 动态保本损机制（Breakeven Transfer）**：当持仓浮盈达到 1 倍初始风险（1R）时，无条件将止损线拉升至开仓成本价，立于不败之地；
   - **双轨止盈出局（Take-Profit）**：支持目标位（如反向结构位）分批平仓 50%，剩余 50% 开启 Trailing Stop 移动追踪止盈（如跟踪 30m 20EMA 或最大回撤）；
   - **硬风控兜底与反向卖点**：固定百分比硬止损（如 5%），以及决策流发出 `action === 'SELL'` 时的强制平仓。
3. **真实严格 A 股成交与因果撮合模型（Lookahead-Free A-Share Execution Model）**：
   - 信号在 Bar $t$ 闭合确认，订单在 **Next-Bar Open** 撮合成交；
   - 严格执行 **T+1 制度**、**涨停一字板无法买入**、**跌停一字板无法卖出（顺延）**、滑点与交易税费（佣金、印花税、过户费）。
4. **三维防未来函数质检与对账体系**：
   - **因果不变性断言**：代码层严格限制时间戳因果性；
   - **实时 vs 回测双轨 Parity 测试**：相同历史切片下，离线回测与实时推流产生的决策与信号 100% 逐字对齐；
   - **未来数据扰动/注入测试**：截断或注入未来噪声，验证当前决策不发生任何漂移。
5. **与原生终端可视化（`integrate-native-terminal-visualization`）协同**：
   - 回测产生的逐笔交易明细（买入点、止损线演进、分批止盈点、出场点）自动转化为通用绘图指令，通过 QMT/TDX 原生回写管道在桌面端极速复盘；
   - Web 控制台专注于量化绩效指标卡片（收益率、夏普、回撤、胜率、盈亏比）与逐笔交易流水审计。

### 2.2 非目标（Out of Scope）

- 暂不引入复杂的跨标的多资产组合资金抢占与动态权重分配（保持单策略单标的独立验证闭环）；
- 暂不在 Web 端重复造复杂的交互式 K 线看盘图表，专业图表交互全面依托 TDX/QMT 原生终端回写。

---

## 3. 关联影响与依赖

- **依赖的现有模块**：
  - `libs/strategy`: `DecisionFlowEngine`、`FactorPlugin` 纯函数计算接口、滑动窗口 `StrategySeriesImputer`；
  - `libs/signal`: 实时策略执行、`ChanBspDetector`、`ChanBspEpisodeCursor`；
  - `apps/backtest`: 回测执行器与历史数据回放适配器；
  - `apps/signal`: 实时策略信号运行时；
  - `docs/factor-framework-and-alpha-architecture.md`: 聚焦 ETF 市场的系统化 CTA 决策流与 Exit Trinity 设计蓝图；
  - `openspec/changes/integrate-native-terminal-visualization`: 通用绘图指令与 TDX/QMT 回写管道。
