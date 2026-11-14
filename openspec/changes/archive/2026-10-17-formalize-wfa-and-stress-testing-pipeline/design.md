# Design: 量化策略防过拟合验证、滚动前向（WFA）与极端压力测试工程架构设计

## 一、 系统架构总览

为了将“截取段落拟合、极值留作测验”的直觉升级为现代量化工程体系，本方案确立了**“上游纯形态雷达、下游统一动作裁决”**的单向正交分层架构：

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [第四层: 场景体检] 极端事件压力测试套件 (Stress Testing Suite)                  │
│   - A股五大历史黑天鹅沙盒: 2015踩踏 / 2016熔断 / 2018阴跌 / 2024微盘 / 2024脉冲  │
│   - DataSanitizationGuard: 刚性截断 1996 年底前有毒数据，2005 股改全流通基准   │
│   - 核心考核: 极限 VaR/CVaR、出清时滞、一字跌停顺延流动性惩罚、穿仓边界          │
└────────────────────────────────────────▲────────────────────────────────────────┘
                                         │ 门禁守门 (Hard Gate)
┌────────────────────────────────────────┴────────────────────────────────────────┐
│ [第三层: 前向编排] 自动化滚动步进前向回测流水线 (Walk-Forward Analysis Pipeline)│
│   - WalkForwardOrchestrator: Rolling (固定滑窗) & Anchored (扩张窗口) 多 Fold 编排│
│   - HistoricalBarSource 驱动: 训练集/测试集独立 Run，自动加载预热段静默推流      │
│   - 无缝拼接: 串联所有 OOS (Out-of-Sample) 真实前向收益曲线，计算 PSI 衰减率    │
└────────────────────────────────────────▲────────────────────────────────────────┘
                                         │ 调度子任务
┌────────────────────────────────────────┴────────────────────────────────────────┐
│ [第二层: 单向解耦] Alpha 形态雷达与统一动作裁决器彻底正交解耦                   │
│                                                                                 │
│   【上游: 决策树内核 (StrategyEvaluationKernel)】 ── 纯客观形态雷达             │
│   - 纯粹几何形态与动量买卖点计算，无账户持仓状态，不掺杂大盘门禁                │
│   - 输出纯客观候选信号: KernelSignal (BUY / SELL)                               │
│                               │                                                 │
│                               ▼ 单向消费                                        │
│   【下游: 统一动作与风控裁决器 (Execution & Risk Arbiter)】 ── 唯一动作中枢     │
│   - 输入: 候选信号 (Signal) + 持仓快照 (PositionSnapshot) + 大盘体制 (Regime)   │
│   - 开仓风控: 收到 BUY 信号 ──► 大盘雪崩则 Veto 否决拒单，安全则下 BUY ORDER    │
│   - 平仓风控: 持有股票时 ──► 统一三级优先级裁决 (大盘雪崩 > 硬止损 > 策略二卖)  │
│                               │                                                 │
│                               ▼ 唯一订单动作 (CreateOrderDto)                   │
│   【执行与记账: BrokerExecutionSink】                                           │
│   - SimulatedBroker: Next-Bar 撮合成交 (A 股一字涨跌停拦截与顺延)               │
│   - PositionStateMachine: 纯记账员 (T+1 份额冻结解锁与逐日盯市，无平仓裁决权)    │
└────────────────────────────────────────▲────────────────────────────────────────┘
                                         │ 底座指标与因果时序
┌────────────────────────────────────────┴────────────────────────────────────────┐
│ [第一层: 纯数学底座] Rust Polars 极端压力指标与 A 股制度因果保真                 │
│   - 性能算子: DailyReturns / DrawdownSeries / MaxDrawdown / Sharpe / Calmar     │
│   - 压力扩展: VaR(95%/99%) / CVaR / UnderwaterDuration / LiquidityDelayPenalty   │
│   - 撮合保真: Next-Bar 因果律 ($t_{fill} \ge t+1 > t_{signal}$) / 一字跌停顺延  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、 核心模块深度设计

### 模块 1：Alpha 形态信号与统一动作裁决器彻底正交解耦（Alpha-Action Orthogonal Decoupling）

#### 1. 痛点根因与设计原则
- **旧痛点（非对称割裂）**：若在决策树顶层门禁做买入风控，而持仓平仓风控又放在状态机 `onBar`，会导致上游决策树混入宏观规则不再纯粹，下游持仓状态机又越权做平仓决策，平仓动作散落在 `onSignal` 与 `onBar` 两处，引发双头指挥与信号断链。
- **正交解耦设计原则**：
  1. **决策树（上游）只做“纯形态雷达”**：不管大盘暴跌还是暴涨，只要几何结构与动量成立，就忠实发射 `KernelSignal(BUY/SELL)`。决策树保持无状态纯函数计算，不感知账户持仓，不挂载大盘门禁；
  2. **统一动作裁决器（下游）独揽“操盘手职责”**：所有的交易动作（Order Action）、开仓否决与平仓止损，100% 收敛由统一的 `ExecutionRiskArbiter` 裁决；
  3. **持仓状态机回归“纯记账员”**：彻底剔除其内部在 `onBar` 偷偷下卖单的逻辑，仅负责维护成交后的股数、成本均价与 T+1 锁定。

#### 2. 宏观大盘体温与体制规范
```ts
export enum MarketRiskRegime {
  NORMAL = 'NORMAL',                     // 正常交易状态：Alpha 信号自由驱动开平仓
  ELEVATED_RISK = 'ELEVATED_RISK',       // 高波动预警：开仓预算减半，紧缩追踪止损
  SYSTEMIC_CRUNCH = 'SYSTEMIC_CRUNCH',   // 系统性雪崩：全面禁止开仓，执行保护性清仓
  LIQUIDITY_FREEZE = 'LIQUIDITY_FREEZE', // 流动性枯竭：挂单顺延，记录流动性惩罚
}

export interface MacroRegimeSnapshot {
  readonly regime: MarketRiskRegime;
  readonly marketAtrPercentile: number;   // 大盘真实波幅历史分位数 (0.0 ~ 1.0)
  readonly marketBreadthRatio?: number;   // 全市场上涨标的占比
  readonly isLiquidityFrozen: boolean;    // 是否处于跌停潮/千股跌停状态
}
```

#### 3. 统一动作裁决器（`ExecutionRiskArbiter`）核心规格
作为 `BrokerExecutionSink` 内部的核心裁决中枢，每根 Bar 推进及每个信号到达时，执行绝对对称的裁决矩阵：

```ts
export class ExecutionRiskArbiter {
  private consecutiveLosses = 0;
  private cooldownRemainingBars = 0;

  /**
   * 综合裁决入口：输入客观信号、当前持仓与大盘环境，输出唯一的交易订单动作
   */
  public arbitrate(context: {
    readonly bar: StrategyBar;
    readonly signal?: KernelSignal;
    readonly position: Readonly<PositionSnapshot>;
    readonly macroRegime: MacroRegimeSnapshot;
    readonly availableCash: number;
  }): CreateOrderDto | null {
    const { bar, signal, position, macroRegime, availableCash } = context;

    // 1. 冷却期递减
    if (this.cooldownRemainingBars > 0) {
      this.cooldownRemainingBars -= 1;
    }

    // ─────────────────────────────────────────────────────────────
    // 【平仓管卡】：持有仓位 (HOLDING) 时，统一三级优先级单一裁决
    // ─────────────────────────────────────────────────────────────
    if (position.status === POSITION_STATUSES.HOLDING) {
      // 优先级 1 (系统生存级)：大盘突发系统性雪崩，无条件紧急清仓
      if (macroRegime.regime === MarketRiskRegime.SYSTEMIC_CRUNCH) {
        return this.createSellOrder(position, bar.timestamp, 'SYSTEMIC_RISK_MELTDOWN');
      }

      // 优先级 2 (持仓风控级)：个股浮亏跌破硬止损线 (如成本价 -8%)
      const HARD_STOP_LOSS_RATIO = -0.08;
      if (position.unrealizedPnlRatio <= HARD_STOP_LOSS_RATIO) {
        this.triggerCooldown();
        return this.createSellOrder(position, bar.timestamp, 'HARD_STOP_LOSS');
      }

      // 优先级 3 (策略逻辑级)：收到决策树客观发出的反向 SELL 信号 (如缠论二卖)
      if (signal && signal.signalKind === SIGNAL_KINDS.EXIT) {
        return this.createSellOrder(position, signal.signalTime, signal.signalType);
      }

      return null;
    }

    // ─────────────────────────────────────────────────────────────
    // 【买入管卡】：无持仓 (EMPTY) 且收到 BUY 候选信号时
    // ─────────────────────────────────────────────────────────────
    if (position.status === POSITION_STATUSES.EMPTY && signal?.signalKind === SIGNAL_KINDS.ENTRY) {
      // 开仓风控检查 A：大盘处于高危/雪崩期，直接 Veto 否决
      if (macroRegime.regime === MarketRiskRegime.SYSTEMIC_CRUNCH) {
        return null; // 拒单，记录风控否决日志
      }

      // 开仓风控检查 B：处于频繁磨损冷静期，暂缓开仓
      if (this.cooldownRemainingBars > 0) {
        return null;
      }

      // 检查通过：计算手数生成买单
      return this.createBuyOrder(position, bar, signal.signalTime, availableCash);
    }

    return null;
  }
}
```

- **收益**：
  1. **彻底拔除双头平仓**：平仓动作只有一个出口（`ExecutionRiskArbiter`），平仓原因清晰追溯；
  2. **决策树回归纯粹**：决策树不用挂大盘门禁，不感知持仓，单标的代码极其干净；
  3. **单向消费关系**：裁决器依赖决策树提供的候选形态，但开仓和持仓的生杀大权 100% 由裁决器掌握。

---

### 模块 2：滚动步进前向回测流水线（Walk-Forward Analysis Pipeline, WFA）

#### 1. 编排器机制（`WalkForwardOrchestrator`）
彻底废除人工凭感觉挑选“某几年开发、某几年测试”的主观做法，采用时序严格推进的步进切分：

```
时序推进 ────────────────────────────────────────────────────────────────────────►
Fold 1:  [=== Train: 3年 ===] [--- OOS Test: 1年 ---]
Fold 2:         [=== Train: 3年 ===] [--- OOS Test: 1年 ---]
Fold 3:                [=== Train: 3年 ===] [--- OOS Test: 1年 ---]
Fold 4:                       [=== Train: 3年 ===] [--- OOS Test: 1年 ---]

拼接合成:                      [OOS 1] + [OOS 2] + [OOS 3] + [OOS 4]
                                 │
                                 ▼
                     全生命周期无偏见真实前向曲线 (WFA Equity Curve)
```

#### 2. 两个运行模式
1. **Rolling WFA（固定滑窗滚动模式）**：
   - 训练窗长度固定（如 750 交易日/3 年），测试窗长度固定（如 250 交易日/1 年）；
   - 适应于捕捉市场最新微观结构，自动遗忘远古失效模式；
2. **Anchored WFA（锚定扩张窗口模式）**：
   - 训练窗起点固定锚定在现代 A 股原点（2005 年 5 月股改），随着时间推进训练集不断扩张；
   - 适应于检验策略是否具备跨越十几年宏观大周期的长效记忆。

#### 3. 状态隔离与预热推进契约
- 每一个 Fold 的训练集与测试集均作为一个独立的 `BacktestRun` 任务执行；
- **无状态泄漏保证**：测试集执行时，`HistoricalBarSource` 依据测试集的 `startDate`（即 `publicFrom`）自动向前加载 `requiredBars` 根 K 线进行静默预热，推进单调游标，确保**无任何测试集之外的未来信息泄露**；
- **合成拼接器（`WfaStitcher`）**：在所有 Folds 完成后，提取各测试集的 `DailyNavSnapshot` 序列，按照复利净值公式逐日缝合，输出整体 WFA 绩效与参数稳定性指数（Parameter Stability Index, PSI）。

---

### 模块 3：A 股五大历史极端事件压力测试套件（Stress Testing Suite & Benchmarks）

#### 1. 历史数据清洗门禁（`DataSanitizationGuard`）
- **硬性拦截准则**：
  在 `HistoricalBarSource` 加载数据入口，强制断言：
  若请求的 `startDate < 1996-12-16T00:00:00.000Z`，系统直接抛出 `InvalidHistoricalDataBoundaryException` 并拒绝执行。
  > *原因*：1996 年底前 A 股无涨跌停、曾行 T+0、标的稀缺，属于毒化现代模型的不可用数据。
- **推荐测试基准**：默认回测起点建议从 **2005 年 5 月 1 日（股权分置改革）** 起步。

#### 2. 预设五大极端压力沙盒定义（`PRESET_STRESS_SCENARIOS`）
位于 `libs/strategy/src/stress-testing/stress-scenarios.constants.ts`：

| 场景 ID | 场景名称与时段 | 核心微观特征与检验目的 | 重点防守考核点 |
| :--- | :--- | :--- | :--- |
| `CRASH_2015` | **2015 杠杆踩踏断崖**<br>`2015-06-15 ~ 2015-08-26` | 场外配资去杠杆，千股无量一字跌停，千股停牌躲避平仓 | 跌停板无法卖出的流动性冻结惩罚、最坏回撤与穿仓边界 |
| `CIRCUIT_2016`| **2016 熔断制度断层**<br>`2016-01-04 ~ 2016-01-07` | 交易时间骤断（仅开市十几分钟即休市），磁吸效应暴跌 | 开盘隔夜跳空缺口吸收能力、短时巨震下的风控响应 |
| `BEAR_2018` | **2018 贸易战单边阴跌**<br>`2018-01-29 ~ 2018-10-19` | 缺乏强脉冲反弹，中枢单边持续阴跌下移，无量钝化 | 频繁假突破下的止损摩擦控制、是否具备防抽打休眠机制 |
| `SQUEEZE_2024`| **2024 初量化微盘踩踏**<br>`2024-01-08 ~ 2024-02-08` | 雪球密集敲入，DMA 杠杆赎回，小微盘无流动性连续暴跌 | 宽基与个股严重背离时的微观流动性预警与及时减仓 |
| `PULSE_2024` | **2024 924 暴利政策脉冲**<br>`2024-09-24 ~ 2024-10-08` | 历史最高成交量，5 日暴涨后出现巨幅高开低走大阴线 | 追高防 FOMO 门禁，避免在情绪极端狂热顶部满仓站岗 |

#### 3. 真实制度撮合保真
- 严格复用 `SimulatedBroker` 的 `isOneWordLimitDown(bar)`：
  一字跌停时平仓单挂起为 `BLOCKED`，禁止成交并顺延至下一 Bar 尝试撮合，彻底剔除“跌停板逃顶”的虚假回测收益。

---

### 模块 4：纯数学 Polars 极端压力指标库（Rust SIMD 底座）

在 `libs/indicators/src/performance/stress-metrics.ts` 中基于 `nodejs-polars` SIMD 原语实现，坚守**纯数学、零 I/O、无环境依赖**原则：

```
                                  Polars 表达式向量化计算
Daily Returns Series ───► [ pl.col('ret').quantile(0.01/0.05) ] ──────► VaR (在险价值)
                                      │
                                      ▼
                          [ pl.col('ret').filter(pl.col('ret') <= VaR).mean() ] ──► CVaR (超额期望损失)

NAV Curve ──────────────► [ pl.col('nav') / pl.col('nav').cumMax() - 1 ]
                                      │
                                      ▼
                          [ 向量化统计处于回撤态的最大连续天数 ] ──► Underwater Duration (回撤潜伏期)
```

1. **`computeValueAtRisk(dailyReturns, confidence = 0.95 | 0.99)`**：
   计算在给定置信度下的历史日度在险价值（VaR）；
2. **`computeConditionalVaR(dailyReturns, confidence = 0.95 | 0.99)`**：
   计算跌破 VaR 阈值后的平均期望极端损失（CVaR / Expected Shortfall）；
3. **`computeUnderwaterDuration(navSeries)`**：
   计算策略从高点回撤到创出新高所经历的最长交易日天数；
4. **`computeLiquidityDelayPenalty(trades)`**：
   统计所有曾处于 `BLOCKED` 状态顺延执行的交易，计算“信号发出日市价”与“真实成交价”之间的滑点损耗总额；
5. **`computeOverfittingRatio(trainSharpe, testSharpe)`**：
   计算样本外夏普衰减比率（$\frac{Sharpe_{OOS}}{Sharpe_{IS}}$），衰减率超过 50% 标红预警。

---

## 三、 数据库与实体层演进设计

保持向前兼容，基于单调递增 Migration 规则创建 `deploy/database/migrations/029_add_backtest_suites_and_stages.sql`：

```sql
-- 增加回测分段与套件关联支持
ALTER TABLE `backtest_runs`
  ADD COLUMN `parent_run_id` BIGINT UNSIGNED NULL DEFAULT NULL COMMENT '父任务ID，用于串联 WFA Folds 或压力测试套件' AFTER `id`,
  ADD COLUMN `suite_id` VARCHAR(64) NULL DEFAULT NULL COMMENT '套件唯一标识符' AFTER `parent_run_id`,
  ADD COLUMN `stage` ENUM('FULL', 'TRAIN', 'VAL', 'TEST', 'STRESS') NOT NULL DEFAULT 'FULL' COMMENT '回测阶段类型' AFTER `suite_id`,
  ADD COLUMN `scenario_id` VARCHAR(64) NULL DEFAULT NULL COMMENT '关联的压力测试预设场景ID' AFTER `stage`,
  ADD CONSTRAINT `fk_backtest_runs_parent` FOREIGN KEY (`parent_run_id`) REFERENCES `backtest_runs` (`id`) ON DELETE CASCADE;

CREATE INDEX `idx_backtest_runs_parent_stage` ON `backtest_runs` (`parent_run_id`, `stage`);
CREATE INDEX `idx_backtest_runs_suite` ON `backtest_runs` (`suite_id`);
```

---

## 四、 架构防御与门禁保障（Guardrails & Parity）

1. **Next-Bar 因果律守门**：`strategy-dual-timestamp.guard.spec.ts` 保持守护，任何新增的压力测试与 WFA 驱动必须保证 $t_{fill} \ge t+1 > t_{signal}$；
2. **三链路同构守门**：`strategy-pipeline-homogeneity.guard.spec.ts` 保持守护，WFA 与压力测试底层共用同一个 `StrategyEvaluationKernel`；
3. **纯数学边界守门**：`libs/indicators` 严禁引入外部框架与 I/O；
4. **数据防毒守门**：新增加载守门单测 `data-sanitization.guard.spec.ts`，验证输入 1996 年前时间戳时 100% 阻断。
