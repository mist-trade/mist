# Proposal: 为 @app/indicators 扩充现代量化时序纯数学原语算子库

## 1. 背景与核心痛点

当前 Mist 系统的 `@app/indicators`（`libs/indicators`）库主要包含传统振荡器指标（MACD, KDJ, RSI, ADX, ATR, DualMA）。在将策略核心战场全面聚焦于**高流动性 ETF 市场与系统化 CTA 决策流**后，暴露出以下核心痛点：

1. **缺乏现代量化因子工程所需的纯数学时序原语（Alpha Primitives）**：
   - 工业界经典 Alpha 库（WorldQuant 101, 国君 191, Qlib 158）以及强化学习自动因子挖掘（AlphaGPT）中广泛使用的原子算子（如 `ts_rank` 滚动分位数、`decay_linear` 线性衰减均线、`ts_argmax`/`ts_argmin` 极值时差、`rolling_corr` 滚动相关系数等）在现有系统中完全缺失。
2. **纯手写循环带来的“怕算错”心智负担与数值漂移**：
   - 如果每一个自研因子都从头手写底层命令式循环，既面临 JS 浮点数相消与累加漂移的天然缺陷，又容易因窗口越界、除零未捕获或 Off-by-one 偏差导致隐蔽 Bug；每次新增因子都需要高强度的交叉核验，难以扩展。
3. **对外契约必须完全融入 Mist 现存体系**：
   - 无论底层采用何种加速引擎，上层调用方（`libs/strategy`、`apps/mist`、`apps/backtest`）绝不应感知底层的复杂性。对外 API 必须 100% 与 Mist 既有的 `compute*Series`（带 `begIndex` 暖机位偏移对齐）与 `compute*Observation`（尾部单点即时观测值）规范保持一致，严禁泄露任何第三方类库对象。

---

## 2. 目标与范围（Scope & Goals）

### 2.1 核心目标

1. **纯内部封装 Polars 工业级 Rust 计算引擎（方案 A）**：
   - 引入开源高性能 DataFrame/Series 引擎 `nodejs-polars`（N-API 预编译原生绑定）作为 `@app/indicators` 内部的**私有计算黑盒**；
   - **严格限定职责边界**：**不做量化撮合回测，仅作为纯数学时序计算底座**。利用 Polars 原生经过百万级测试验证的 SIMD 滑动窗口算子（`rollingMean`、`rollingStd`、`rollingQuantile`、`diff`、`shift`）消除对“算错”的恐惧。
2. **对齐 Mist 既有风格的 8 个标准原子算子（Series 与 Observation 双轨契约）**：
   - **`computeTsRankSeries` / `computeTsRankObservation`**：滚动窗口内的当前值百分比分位数（0.0 ~ 1.0）或序数秩；
   - **`computeTsArgMaxSeries` / `computeTsArgMaxObservation`**：滚动窗口内极大值发生的相对位置距今 Bar 偏移量；
   - **`computeTsArgMinSeries` / `computeTsArgMinObservation`**：滚动窗口内极小值发生的相对位置距今 Bar 偏移量；
   - **`computeDecayLinearSeries` / `computeDecayLinearObservation`**：线性加权衰减移动平均（权重 $w_k = k$）；
   - **`computeRollingCorrSeries` / `computeRollingCorrObservation`**：双序列滑动皮尔逊相关系数（零方差平坦序列安全返回 0.0）；
   - **`computeRollingStdSeries` / `computeRollingStdObservation`**：滚动样本标准差（真实历史波动率，默认 Bessel 校正 `ddof: 1`）；
   - **`computeTsDeltaSeries` / `computeTsDeltaObservation`**：时序一阶差分（$x_t - x_{t-p}$）；
   - **`computeTsDelaySeries` / `computeTsDelayObservation`**：时序滞后算子（$x_{t-p}$）。
3. **完全遵循 Mist 内部规范的架构封装**：
   - **零类型泄漏（Zero Leakage）**：上层传入的永远是原生 `readonly number[]`，输出的永远是 Mist 标准结构 `{ begIndex: number, values: readonly number[] }` 或标量 `number`，Polars 对象绝不跨越库边界；
   - **标准异常契约**：参数非法时统一抛出 Mist 原生的 `IndicatorInputError`；
   - **架构守卫收敛**：`nodejs-polars` 严格收敛限制在 `libs/indicators/src/` 内部，在 `indicators-boundary.guard.spec.ts` 中设置强检验。

### 2.2 非目标（Out of Scope）

- 暂不拿 Polars 替代回测撮合引擎（保持自研 `BacktestRunExecutor` 的持仓状态机与 T+1 撮合）；
- 暂不在对外 API 中暴露任何 Polars DataFrame/Series 类；
- 暂不在此引入 SMC 几何图表结构（FVG/OB/Sweep 属于阶段二专项）；
- 暂不在此引入字符串 AST 公式动态解析器（属于阶段五 `ExpressionAlphaPlugin`）。

---

## 3. 关联影响与依赖

- **受影响模块**：
  - `package.json`：新增 `nodejs-polars` 依赖；
  - `libs/indicators/src/time-series/`：基于 Polars 内部实现 8 个原子算子并提供标准 Mist 包装；
  - `libs/indicators/src/index.ts`：集中导出所有 `compute*Series` 与 `compute*Observation`；
  - `libs/indicators/src/indicators-boundary.guard.spec.ts`：将 `nodejs-polars` 纳入架构守卫收敛范围。
