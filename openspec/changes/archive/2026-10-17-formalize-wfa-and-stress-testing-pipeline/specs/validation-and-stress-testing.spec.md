# Spec: 量化策略前向验证与压力测试行为规约 (Delta Specification)

## 1. 历史数据清洗门禁规约 (`DataSanitizationGuard`)

### 1.1 阻断规则
- **SHALL**: 当调用 `HistoricalBarSource` 或任何回测接口加载历史行情时，若请求的 `startDate < 1996-12-16T00:00:00.000Z`，系统必须抛出 `InvalidHistoricalDataBoundaryException`，阻断执行；
- **SHALL**: 错误响应中必须明确指引：“A 股 1996 年 12 月 16 日前无涨跌停限制且交易制度异质，属于不可用于现代策略回测的有毒数据，建议以 2005 年 5 月股改全流通作为推荐起点”。

---

## 2. 统一动作与风控裁决器规约 (`ExecutionRiskArbiter`)

### 2.1 职责边界与单向消费
- **SHALL**: 决策树（`StrategyEvaluationKernel`）专职作为形态雷达，输出纯客观候选信号（`KernelSignal: BUY / SELL`），保持无状态纯函数计算，严禁挂载大盘风控门禁，严禁感知账户持仓；
- **SHALL**: 系统中所有的交易订单动作（`CreateOrderDto`）必须 100% 收敛由统一的 `ExecutionRiskArbiter` 进行裁决生成，彻底消除双头平仓。

### 2.2 开仓风控裁决规约
- **SHALL**: 当收到决策树的 `BUY` 候选信号且账户无持仓（`status === EMPTY`）时：
  - 若大盘体制处于 `SYSTEMIC_CRUNCH`（系统性雪崩），裁决器必须行使一票否决权（Veto），禁止生成买单；
  - 若处于连续磨损冷静期（Cool-down Period），裁决器必须拦截，禁止生成买单；
  - 仅当大盘环境允许且无冷却阻断时，方可按可用资金和百股（手）整倍数生成 `BUY ORDER`。

### 2.3 平仓风控裁决规约（三级优先级单一出口）
- **SHALL**: 当账户持有仓位（`status === HOLDING`）时，裁决器必须按照严格的三级优先级判定是否生成卖单：
  - **[优先级 1] 系统生存级**: 若大盘体制进入 `SYSTEMIC_CRUNCH`，无条件立即生成 `SELL ORDER` 紧急清仓动作；
  - **[优先级 2] 持仓风控级**: 若个股持仓浮亏跌破硬止损阈值（如 -8%），立即生成 `SELL ORDER` 止损动作并触发冷静期计数；
  - **[优先级 3] 策略逻辑级**: 若收到决策树发出的客观反向 `SELL` 候选信号（如缠论二卖/三卖），生成 `SELL ORDER` 结构出场动作；
- **SHALL**: 持仓状态机（`PositionStateMachine`）必须回归纯记账员定位，严禁在内部通过 `onBar` 自行生成平仓订单。

---

## 3. 滚动步进前向回测规约 (`WalkForwardOrchestrator`)

### 3.1 切分与执行
- **SHALL**: 支持 `Rolling` 与 `Anchored` 两种模式；
- **SHALL**: 对于每一个 Fold，系统必须先创建独立的训练集 `BacktestRun(stage: 'TRAIN')`，再创建对应的测试集 `BacktestRun(stage: 'TEST')`；
- **SHALL**: 测试集执行时，前序 K 线仅作为预热段（`timestamp < publicFrom`），驱动内核执行 `evaluateSilent` 推进单调游标，严禁将测试集信息泄露给训练集（严格消除前视偏差）；
- **SHALL**: 所有 Folds 完成后，系统必须调用 `WfaStitcher` 将各 Fold 测试集的日度净值时序（`DailyNavSnapshot`）按照时间顺序拼接为完整的 `wfaOosNavSeries`。

---

## 4. 极端场景压力测试套件规约 (`StressTestingSuite`)

### 4.1 预设场景库
- **SHALL**: 系统必须预置五大标准历史压力场景：
  1. `CRASH_2015`: 2015-06-15 至 2015-08-26（杠杆股灾千股跌停）
  2. `CIRCUIT_2016`: 2016-01-04 至 2016-01-07（熔断制度闪崩）
  3. `BEAR_2018`: 2018-01-29 至 2018-10-19（中美贸易战长周期阴跌）
  4. `SQUEEZE_2024`: 2024-01-08 至 2024-02-08（微盘股踩踏与雪球敲入）
  5. `PULSE_2024`: 2024-09-24 至 2024-10-08（924 超级政策脉冲与极端高开低走）
- **SHALL**: 压力测试套件运行后，必须输出独立的《极端压力测试体检单》，包含五大场景的极限表现矩阵。

---

## 5. 纯数学压力指标规约 (`PerformanceMetricsExtension`)

### 5.1 算子要求
- **SHALL**: 所有数学计算必须基于 Rust `nodejs-polars` SIMD 表达式向量化计算，严禁 JS 循环与外部 I/O 依赖；
- **SHALL**: 压力指标集必须包含：
  - `computeValueAtRisk`: 返回 95% 及 99% 置信度下的在险价值；
  - `computeConditionalVaR`: 返回跌破 VaR 阈值后的平均期望损失；
  - `computeUnderwaterDuration`: 返回策略最大回撤潜伏持续天数；
  - `computeLiquidityDelayPenalty`: 统计所有 `BLOCKED` 挂单顺延导致的额外损失敞口；
  - `computeOverfittingRatio`: 返回 $\frac{Sharpe_{OOS}}{Sharpe_{IS}}$ 比率。
