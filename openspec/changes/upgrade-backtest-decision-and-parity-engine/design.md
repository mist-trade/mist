# Design: 量化回测决策状态机、严格 A 股撮合与防未来函数质检体系

## 1. 架构总览

```mermaid
graph TD
    subgraph L1["Layer 1: 策略决策与大脑层 (Decision Flow Engine)"]
        DF["DecisionFlowEngine (树状流: GUARD ➔ BRANCH ➔ EXTRACTOR ➔ CONSENSUS ➔ TERMINAL)"]
        DF -->|"输出: DecisionResult (BUY / SELL / ABORT, confidence, evidence)"| Out1["决策观点与证据快照"]
    end

    subgraph L2["Layer 2: 策略决策与持仓生命周期状态机 (Position State Machine)"]
        SM["PositionStateMachine"]
        D1["Position Tracker (持仓量、成本价 costPrice、最高浮盈 High Watermark)"]
        D2["Exit Trinity Evaluator (出局三部曲: 初始结构止损 / 1R保本损 / 分批止盈 / Trailing Stop)"]
        SM --- D1
        SM --- D2
    end

    subgraph L3["Layer 3: 执行与撮合层 (Execution / Broker)"]
        E1["Simulated Broker (回测: Next-Bar Open / T+1 / 涨跌停 / 印花税与规费 / 滑点)"]
        E2["Live Gateway (实盘: QMT / 券商委托与回报网关)"]
    end

    subgraph L4["Layer 4: 呈现与质检层 (Presentation & Parity)"]
        P1["Web 控制台 (绩效报表 / 逐笔流水 / 出场归因 / 质检报告)"]
        P2["TDX / QMT 标记回写管道 (桌面专业终端极速看盘复盘)"]
        P3["Parity & Lookahead Test (双轨对账与因果时序断言)"]
    end

    L1 -->|"驱动状态流转"| L2
    L2 -->|"产生撮合委托"| L3
    L3 -->|"输出流水与事件"| L4
```

---

## 2. 策略决策与持仓生命周期状态机（Position State Machine）

### 2.1 状态转移图

```mermaid
stateDiagram-v2
    [*] --> Empty: 初始空仓
    Empty --> PendingEntry: DecisionFlow 产生 BUY 信号 (记录初始止损锚点)
    PendingEntry --> Holding: Next-Bar Open 撮合成交 (建立全量仓位, 记录 costPrice)
    PendingEntry --> Empty: 一字涨停无法买入 / 超时撤单
    Holding --> Holding: 逐 Bar 更新 High Watermark；浮盈达 1R 时上移止损线至成本价
    Holding --> PendingPartialExit: 触碰第一止盈目标位 (反向结构位 / 目标盈亏比)
    PendingPartialExit --> Holding: 撮合平仓 50%，记录半仓收益，剩余 50% 开启 Trailing Stop
    Holding --> PendingExit: 触发止损 (结构下轨 / 跌破成本价 / 硬止损) 或 Trailing Stop 或反向 SELL
    PendingExit --> Closed: 撮合成交 (全量平仓，结算终局盈亏与出场归因)
    PendingExit --> PendingExit: 一字跌停无法卖出 (受T+1及跌停限制，顺延至次日)
    Closed --> Empty: 结算归档，重置为初始空仓
```

### 2.2 出场与止损规则配置契约（`StrategyExitPolicy`，全面对齐 Exit Trinity）

```typescript
export interface StrategyExitPolicy {
  // 1. 通用结构止损 (支持从决策流返回的 evidence 中动态提取结构下轨)
  structuralStop?: {
    enabled: boolean;
    source: 'evidence' | 'fixed_price';
    evidenceKey?: string; // 默认 'stopLossPrice'，亦可指定 'chan.central.zd'、'smc.order_block.bottom' 或 'smc.fvg.bottom'
    bufferRatio?: number; // 缓冲比例，如 0.005 (0.5%)
  };

  // 2. 动态保本机制 (支持 1R 保本损转移模式)
  breakEven?: {
    enabled: boolean;
    mode: '1R' | 'profit_ratio'; // '1R': 浮盈达到 1 倍初始风险时保本; 'profit_ratio': 浮盈达到固定百分比时保本
    triggerProfitRatio?: number; // mode 为 profit_ratio 时的阈值 (如 0.03 = 3%)
  };

  // 3. 双轨止盈之移动追踪止盈 (Trailing Stop)
  trailingStop?: {
    enabled: boolean;
    mode: 'callback_ratio' | 'indicator_track'; // 回撤比例模式 或 均线跟踪模式
    activationProfitRatio?: number; // 激活阈值 (如浮盈达到 5% 或 2R)
    callbackRatio?: number; // 从最高点回撤比例 (如 2%) 触发平仓
    indicatorKey?: string; // 跟踪指标破位离场，如 'ema20'
  };

  // 4. 双轨止盈之目标位分批止盈 (Partial Profit)
  partialProfit?: {
    enabled: boolean;
    targetRatio: number; // 达到目标盈亏比 (如 2.5R 或目标位) 触发减仓
    closeRatio: number; // 平仓比例，默认 0.5 (减仓 50%)
  };

  // 5. 硬风控止损 (底线兜底)
  hardStopLossRatio?: number; // 固定止损比例，如 0.05 (5%)

  // 6. 决策流反向卖出信号出场
  oppositeSignalExit?: boolean; // 当决策流产生 action === 'SELL' 确立出场

  // 7. 最大持仓 K 线数超时出场
  maxHoldingBars?: number; // 超过 N 根 Bar 未触发止盈止损强制平仓
}
```

---

## 3. A 股严格成交撮合模型（Lookahead-Free Simulated Broker）

### 3.1 时序与撮合规则

| 动作 | 判定时机 | 撮合时机与价格 | 异常与边界处理 |
| :--- | :--- | :--- | :--- |
| **开仓买入** | Bar $t$ 闭合计算确认决策流 `BUY` | Bar $t+1$ 以 `open` 价格撮合 | 若 Bar $t+1$ 涨停一字板（`open == highLimit`），标记 `BUY_REJECTED_LIMIT_UP`，撤单放弃 |
| **盘中触价止损** | Bar $t$ 处于持仓状态且已过 T+1 | 若 `bar.low <= stopPrice`：<br>• 若 `open <= stopPrice`，以 `open` 成交；<br>• 否则以 `stopPrice` 撮合 | 若 Bar $t$ 跌停一字板（`open == lowLimit`），标记 `SELL_BLOCKED_LIMIT_DOWN`，顺延至次日 |
| **收盘信号/形态卖出** | Bar $t$ 闭合计算满足出场条件 | Bar $t+1$ 以 `open` 价格撮合 | 严格受 T+1 限制（当天买入的标的当天不可卖出，持仓锁定至次日） |

### 3.2 摩擦成本与滑点模型（支持个股与 ETF 差异化费率）

- **股票印花税 (Stamp Duty)**: 卖出单向 `tradeAmount * 0.0005`（**ETF 交易免征印花税**，系统根据标的类别自动免除）。
- **券商佣金 (Commission)**: `max(5.0, tradeAmount * 0.00025)` (买卖双向)。
- **过户费 (Transfer Fee)**: `tradeAmount * 0.00001` (买卖双向)。
- **滑点 (Slippage)**: 默认 0.1% 或固定 1~2 Tick（ETF 盘口价差通常仅 0.001 元，可配置为更低滑点）。

---

## 4. 三维防未来函数质检与对账机制

```mermaid
graph TD
    subgraph V1["1. 因果不变性断言 (Causality Assertions)"]
        A1["所有指标与决策流输入时间戳 ≤ 决策时间戳"]
        A2["成交时间戳 > 信号确认时间戳 (严格 Next-Bar)"]
        A3["几何形态确认时延校验 (t_confirm ≥ t_extrema)"]
    end

    subgraph V2["2. 双轨对账单元测试 (Live-Backtest Parity Suite)"]
        B1["录制历史行情切片"]
        B2["实时推流引擎运行 (Signal App)"]
        B3["离线回测引擎运行 (Backtest App)"]
        B4["断言: Signal 产生时间/内容/持仓动作 100% 逐字对齐"]
    end

    subgraph V3["3. 未来数据扰动与泄漏测试 (Lookahead Leakage Injection)"]
        C1["在时间点 t 截断或注入未来随机噪声"]
        C2["重新计算 t 时刻的决策输出"]
        C3["断言: t 时刻的信号与持仓决策严格保持不变"]
    end
```

---

## 5. 实体与数据库设计（Schema Migrations）

### 5.1 `backtest_trade_results` 表（支持全量流水与分批平仓记录）

```sql
CREATE TABLE `backtest_trade_results` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `backtest_run_id` INT NOT NULL,
  `security_code` VARCHAR(20) NOT NULL,
  `entry_signal_time` DATETIME(3) NOT NULL,
  `entry_time` DATETIME(3) NOT NULL,
  `entry_price` DECIMAL(12, 4) NOT NULL,
  `exit_signal_time` DATETIME(3) NOT NULL,
  `exit_time` DATETIME(3) NOT NULL,
  `exit_price` DECIMAL(12, 4) NOT NULL,
  `exit_reason` VARCHAR(60) NOT NULL, -- 'STRUCTURAL_STOP' | 'BREAK_EVEN' | 'PARTIAL_PROFIT' | 'TRAILING_STOP' | 'HARD_STOP_LOSS' | 'OPPOSITE_SIGNAL' | 'TIMEOUT'
  `is_partial` TINYINT(1) NOT NULL DEFAULT 0, -- 是否为半仓分批止盈流水
  `holding_bars` INT NOT NULL,
  `pnl_amount` DECIMAL(14, 4) NOT NULL,
  `pnl_ratio` DECIMAL(8, 4) NOT NULL,
  `pnl_r_multiple` DECIMAL(6, 2) DEFAULT NULL, -- 盈亏 R 计数 (如 +2.5R, -1.0R)
  `total_fee` DECIMAL(10, 4) NOT NULL,
  `context_snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_run_id` (`backtest_run_id`),
  INDEX `idx_security` (`security_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. 与原生终端可视化（QMT / TDX）与 Web 控制台分工

1. **Web 端 (`mist-fe`)**：
   - 任务控制与状态轮询；
   - 量化绩效卡片：总收益率、年化收益率、夏普比率、最大回撤、胜率、盈亏比、交易总次数、平均持仓周期；
   - 逐笔 Trade 流水表格（包含入场时间/价格、出场时间/价格、持仓时长、分批平仓标记、出场归因标签）；
   - 因果质检报告（时序断言与双轨对账状态）。
2. **桌面端 (`TDX / QMT`)**：
   - 通过 `openspec/changes/integrate-native-terminal-visualization` 提供的绘图指令接口，将回测生成的 Trade 序列自动转为买入 Pin 标、卖出 Pin 标、持仓连接线与动态止损警戒线，在桌面专业终端极速复盘。

---

## 4. 三维防未来函数质检与对账机制

```mermaid
graph TD
    subgraph V1["1. 因果不变性断言 (Causality Assertions)"]
        A1["所有指标输入时间戳 ≤ 决策时间戳"]
        A2["成交时间戳 > 信号确认时间戳"]
        A3["缠论买点确认时延校验 (t_confirm ≥ t_extrema)"]
    end

    subgraph V2["2. 双轨对账单元测试 (Live-Backtest Parity Suite)"]
        B1["录制历史行情切片"]
        B2["实时推流引擎运行 (Signal App)"]
        B3["离线回测引擎运行 (Backtest App)"]
        B4["断言: Signal 产生时间/内容/持仓动作 100% 逐字对齐"]
    end

    subgraph V3["3. 未来数据扰动与泄漏测试 (Lookahead Leakage Injection)"]
        C1["在时间点 t 截断或注入未来随机噪声"]
        C2["重新计算 t 时刻的决策输出"]
        C3["断言: t 时刻的信号与持仓决策严格保持不变"]
    end
```

---

## 5. 实体与数据库设计（Schema Migrations）

### 5.1 `backtest_trade_results` 表（替代/升级现有仅信号表）

```sql
CREATE TABLE `backtest_trade_results` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `backtest_run_id` INT NOT NULL,
  `security_code` VARCHAR(20) NOT NULL,
  `entry_signal_time` DATETIME(3) NOT NULL,
  `entry_time` DATETIME(3) NOT NULL,
  `entry_price` DECIMAL(12, 4) NOT NULL,
  `exit_signal_time` DATETIME(3) NOT NULL,
  `exit_time` DATETIME(3) NOT NULL,
  `exit_price` DECIMAL(12, 4) NOT NULL,
  `exit_reason` VARCHAR(60) NOT NULL, -- 'STRUCTURAL_CHAN_STOP' | 'TRAILING_STOP' | 'BREAK_EVEN' | 'HARD_STOP_LOSS' | 'OPPOSITE_SIGNAL' | 'TIMEOUT'
  `holding_bars` INT NOT NULL,
  `pnl_amount` DECIMAL(14, 4) NOT NULL,
  `pnl_ratio` DECIMAL(8, 4) NOT NULL,
  `total_fee` DECIMAL(10, 4) NOT NULL,
  `context_snapshot` JSON NOT NULL,
  `created_at` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_run_id` (`backtest_run_id`),
  INDEX `idx_security` (`security_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. 与原生终端可视化（QMT / TDX）与 Web 控制台分工

1. **Web 端 (`mist-fe`)**：
   - 任务控制与状态轮询；
   - 量化绩效卡片：总收益率、年化收益率、夏普比率、最大回撤、胜率、盈亏比、交易总次数；
   - 逐笔 Trade 流水表格（包含入场时间/价格、出场时间/价格、持仓时长、出场归因）；
   - 因果质检报告（时序断言与双轨对账状态）。
2. **桌面端 (`TDX / QMT`)**：
   - 通过 `openspec/changes/integrate-native-terminal-visualization` 提供的绘图指令接口，将回测生成的 Trade 序列自动转为买入 Pin 标、卖出 Pin 标、持仓连接线与动态止损警戒线，在桌面专业终端极速复盘。
