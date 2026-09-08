# Design: 现代量化时序纯数学原语算子库设计（Mist 原生封装 + Polars 内部引擎）

## 1. 架构定位与 Mist 原生封装哲学

为了满足高流动性 ETF 量化因子挖掘与 CTA 规则系统的数学计算需求，同时彻底解除“手写循环怕算错、怕浮点漂移”的心智负担，我们在 `@app/indicators`（`libs/indicators`）内部扩充时序原子算子库。

本设计的核心设计准则是：**对外 100% 融入 Mist 现存体系，对内 100% 委派工业级计算引擎**。

```
                    外部调用方（apps/mist, libs/strategy, apps/backtest）
                                              │
                      ┌───────────────────────▼────────────────────────┐
                      │    @app/indicators 统一对外 API 规范           │
                      │  - compute*Series (返回 TimeSeriesResult)      │
                      │  - compute*Observation (返回 scalar number)     │
                      │  - 纯原生参数: readonly number[]                │
                      │  - 标准错误: IndicatorInputError               │
                      └───────────────────────┬────────────────────────┘
                                              │ (严格模块隔离，零类型泄漏)
┌─────────────────────────────────────────────▼─────────────────────────────────────────────┐
│ libs/indicators/src/time-series/ (内部私有黑盒)                                            │
│                                                                                           │
│   ts-rank.ts            ts-extreme.ts        ts-decay-linear.ts      rolling-corr.ts      │
│   rolling-std.ts        ts-delta-delay.ts    time-series.types.ts    index.ts             │
│                                                                                           │
│   ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│   │ 底层计算引擎：nodejs-polars (Apache Arrow + Rust SIMD 向量化运算)                │   │
│   │ - 职责边界：仅作为纯数学时序计算底座，严禁涉足撮合、持仓或交易状态机             │   │
│   │ - 暖机位裁剪：将 Polars 前置 null 自动转换为 Mist begIndex 对齐机制             │   │
│   └─────────────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 为什么对外必须保持 Mist 原生规范？
1. **统一的系统认知心智**：
   - Mist 系统各模块在消费指标时，普遍遵循 `computeMacdSeries`、`computeKdjSeries` 等函数命名惯例，以及 `{ begIndex, values }` 暖机期与 `values[i] === input[i + begIndex]` 对齐契约；
   - 保持完全相同的结构和命名，调用方无需了解任何第三方库用法，零学习成本，无缝接入现存的策略触发器（`strategy-trigger`）与因子插件体系（`FactorPlugin`）。
2. **零类型泄漏与依赖解耦（Zero Leakage）**：
   - 绝不向外部暴露任何 Polars 类（如 `DataFrame`、`Series`、`Expr`），外界只看得到 TypeScript 基础类型 `readonly number[]` 与 `number`；
   - 未来若引擎升级、切换或替换，外部调用方完全无感。

### 1.2 为什么对内选用 `nodejs-polars` 作为私有引擎？
1. **彻底消除“算错”的心智内耗（权威背书）**：
   - Polars 是开源界经过数万家量化机构严苛检验的工业级引擎，底层基于 Rust SIMD 向量化实现。其内建的 `rollingMean`、`rollingStd`、`rollingQuantile`、`diff`、`shift` 经过数百万次测试用例检验，绝不存在手写循环中常见的滑动窗口越界、Off-by-one、浮点精度相消等隐患。
2. **预编译 N-API 原生插件，零宿主编译负担**：
   - `nodejs-polars` 在 npm 上提供了官方全平台预编译二进制包（macOS Apple Silicon arm64、Linux x64 等）。无需在 Docker 或宿主机安装配置 Rust 编译工具链，直接即装即用。
3. **严格限定职责边界（不做撮合回测，专做数学计算）**：
   - 我们的自研事件驱动回测引擎（`BacktestRunExecutor`）依然负责真实的持仓状态机、1R 保本损转移、分批止盈与 T+1 撮合；
   - Polars 仅作为 `@app/indicators` 内部的**纯数学计算黑盒**，职责纯粹，零架构污染。

---

## 2. 接口契约：Mist 原生风格的 `Series` + `Observation` 双轨制

所有 8 个算子全部提供**全序列（Series）**与**即时观测（Observation）**两种纯函数视图：

### 2.1 核心类型契约 (`libs/indicators/src/time-series/time-series.types.ts`)

```typescript
/** 统一的时序算子全序列返回契约，与现有指标 begIndex 对齐机制保持一致 */
export interface TimeSeriesResult {
  /** 暖机期偏移量。若输入长度不足，begIndex 等于输入数组长度 */
  readonly begIndex: number;
  /** 有效计算值序列。严格对齐输入：values[i] === input[i + begIndex] */
  readonly values: readonly number[];
}

/** 滚动百分比分位数配置选项 */
export interface TsRankOptions {
  /** 是否归一化到 [0.0, 1.0]，默认为 true。若为 false 则返回 1 到 W 的序数秩 */
  readonly normalize?: boolean;
}

/** 滚动标准差配置选项 */
export interface RollingStdOptions {
  /** 自由度调整，默认 1 (样本标准差 / Bessel 校正)，设为 0 为总体标准差 */
  readonly ddof?: number;
}
```

### 2.2 8 个算子的完整函数签名

```typescript
// 1. 滚动分位数 (TsRank)
export function computeTsRankSeries(
  series: readonly number[],
  window: number,
  options?: TsRankOptions,
): TimeSeriesResult;
export function computeTsRankObservation(
  series: readonly number[],
  window: number,
  options?: TsRankOptions,
): number;

// 2. 窗口极大值位置距今偏移量 (TsArgMax)
export function computeTsArgMaxSeries(
  series: readonly number[],
  window: number,
): TimeSeriesResult;
export function computeTsArgMaxObservation(
  series: readonly number[],
  window: number,
): number;

// 3. 窗口极小值位置距今偏移量 (TsArgMin)
export function computeTsArgMinSeries(
  series: readonly number[],
  window: number,
): TimeSeriesResult;
export function computeTsArgMinObservation(
  series: readonly number[],
  window: number,
): number;

// 4. 线性衰减加权均线 (DecayLinear)
export function computeDecayLinearSeries(
  series: readonly number[],
  window: number,
): TimeSeriesResult;
export function computeDecayLinearObservation(
  series: readonly number[],
  window: number,
): number;

// 5. 滚动皮尔逊相关系数 (RollingCorr)
export function computeRollingCorrSeries(
  seriesX: readonly number[],
  seriesY: readonly number[],
  window: number,
): TimeSeriesResult;
export function computeRollingCorrObservation(
  seriesX: readonly number[],
  seriesY: readonly number[],
  window: number,
): number;

// 6. 滚动样本标准差 (RollingStd)
export function computeRollingStdSeries(
  series: readonly number[],
  window: number,
  options?: RollingStdOptions,
): TimeSeriesResult;
export function computeRollingStdObservation(
  series: readonly number[],
  window: number,
  options?: RollingStdOptions,
): number;

// 7. 时序差分 (TsDelta)
export function computeTsDeltaSeries(
  series: readonly number[],
  period?: number,
): TimeSeriesResult;
export function computeTsDeltaObservation(
  series: readonly number[],
  period?: number,
): number;

// 8. 时序滞后 (TsDelay)
export function computeTsDelaySeries(
  series: readonly number[],
  period?: number,
): TimeSeriesResult;
export function computeTsDelayObservation(
  series: readonly number[],
  period?: number,
): number;
```

### 2.3 双轨视图的场景分工
| 视图类别 | 函数命名范式 | 核心调用场景 | 性能特性与返回值 |
| :--- | :--- | :--- | :--- |
| **全序列（Series）** | `compute*Series` | 历史回测批量预热、离线全量因子矩阵生成、图表绘制 | 返回 `{ begIndex, values }`，完美裁剪 Polars 暖机位 `null` |
| **单点观测（Observation）** | `compute*Observation` | 实时分钟 K 线封存触发、`FactorPlugin` 逐 Bar 决策求值 | **时间复杂度仅 $O(W)$**，直接返回 `number` 标量，**零多余垃圾回收对象分配，零全量无用循环** |

---

## 3. 数学定义、Polars 映射与极端数值防线

### 3.1 暖机位映射机制（Polars null 到 Mist begIndex）
* Polars 在执行滑动窗口（如 `s.rollingStd(window)`）时，对前 $W-1$ 根未充满窗口的数据天然填补 `null`；
* 对齐转换规则：
  $$\text{begIndex} = \text{window} - 1$$
  $$\text{values} = \text{outputArray.slice(begIndex)}$$
* 保证返回的 `values` 中全部为有效有限浮点数，完全满足 `values[i] === input[i + begIndex]`。

### 3.2 各算子数值防线与退化保护

1. **`tsRank` 滚动分位数**：
   - 算法：统计当前窗口内小于等于当前值的元素位置。
   - **平坦序列保护**：若窗口内所有值均相等（方差为 0），分位数自然输出对称中位数 `0.5`（避免极端偏向 0 或 1）；
   - **取值区间**：默认归一化到 `[0.0, 1.0]`。

2. **`tsArgMax` / `tsArgMin` 极值偏移量**：
   - 算法：当前 Bar 距离窗口内极值的 Bar 数量，取值范围为整数 `0` 到 `W - 1`（0 表示当前 Bar 即为极值）；
   - **并列极值裁决**：当窗口内存在多个并列极大/极小值时，**严格取距当前 Bar 最近的极值点**（即最小的偏移量），反映最新的价格动态。

3. **`decayLinear` 线性加权衰减移动平均**：
   - 算法：权重向量 $w = [1, 2, \dots, W]$，分母为权重和 $S = \frac{W(W+1)}{2}$；
   - 公式：$\text{DecayLinear}_t = \frac{\sum_{k=1}^W k \cdot x_{t - W + k}}{\sum_{k=1}^W k}$。

4. **`rollingCorr` 滚动皮尔逊相关系数**：
   - 算法：利用协方差与标准差向量运算：
     $$\text{Corr}(X, Y) = \frac{\text{Cov}(X, Y)}{\sigma_X \cdot \sigma_Y}$$
   - **零方差除零防线**：若滑动窗口内任一序列方差为 0（如横盘无波动价格），分母为 0，**安全回退返回 `0.0`**（表示无相关性，绝不返回 `NaN` 或抛错）；
   - **浮点溢出钳位**：因浮点数舍入可能导致 $1.0000000000000002$，输出强制通过 `Math.max(-1, Math.min(1, val))` 严格钳位在 `[-1.0, 1.0]` 之间。

5. **`rollingStd` 滚动样本标准差**：
   - 算法：默认采用无偏估计（Bessel 校正，`ddof: 1`），当 `options.ddof = 0` 时采用总体标准差；
   - 底层完全由 Polars 的 `rollingStd` 原生支持。

6. **`tsDelta` 与 `tsDelay`**：
   - 算法：一阶时序差分 $x_t - x_{t-p}$ 与时序滞后 $x_{t-p}$，默认为 1 阶滞后。

### 3.3 异常处理与边界契约

1. **统一抛出 `IndicatorInputError`**：
   - 当参数非法时，严格抛出 `@app/indicators` 既有的 `IndicatorInputError`：
     - `window <= 0`、`window` 为非整数或 `NaN`；
     - `period <= 0`、`period` 为非整数或 `NaN`；
     - 双序列长度不匹配（`seriesX.length !== seriesY.length`）；
   - 绝不向外暴露底层的 Polars 异常信息。
2. **数据量不足的优雅降级**：
   - Series 视图：若输入长度 $N < W$（或 $N < p + 1$），函数不报错，优雅返回 `{ begIndex: N, values: [] }`；
   - Observation 视图：若输入长度 $N < W$，因无法提供有效观测值，抛出 `IndicatorInputError`。
3. **输入数组不可变性（Immutability）**：
   - 所有函数接收 `readonly number[]`，严禁对调用方传入的数组进行原地修改（即使传入被 `Object.freeze` 冻结的数组也能正常工作）。

---

## 4. 架构隔离与质量守卫

1. **`libs/indicators/src/indicators-boundary.guard.spec.ts` 架构守卫**：
   - 扩充既有的依赖收敛检查，断言 `nodejs-polars` 只允许在 `libs/indicators/src/` 内部被引用；
   - 严禁在 `apps/` 或其他 `libs/` 中直接 `import ... from 'nodejs-polars'`，一旦侵入式引用即 CI 门禁失败。
2. **多维测试保障**：
   - **纸笔手算金标准（Golden Tests）**：针对微型数组用纸笔核算精确基准值；
   - **数学不变量测试**：
     - 常数平坦序列的 `rollingStd` 必为 0.0；
     - 自身与自身的相关系数 `rollingCorr(X, X)` 必为 1.0；
     - 归一化 `tsRank` 必落入 `[0.0, 1.0]`；
   - **两轨等值不变量断言**：对于任意序列，`compute*Observation(series, W)` 必须与 `compute*Series(series, W).values.at(-1)` 在数值上完全严格相等；
   - **性能与内存验证**：确认 Observation 仅截取尾部 $W$ 长度计算，不随整体历史长度膨胀。

