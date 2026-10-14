# 领域行为规范：波动率通道核心指标算子规约 (基于 nodejs-polars)

## 1. 纯算力核心通用原则

1. **输入防御**：所有指标在输入数组长度不足以完成最小计算窗口（`length < minRequired`）时，`compute*Series` 返回 `{ begIndex: length, ...arrays: [] }`；`compute*Observation` 抛出标准 `IndicatorInputError`；
2. **浮点安全**：指标内部必须对除以 0、全平盘序列、空数组做安全熔断（如平盘标准差返回 `0.0`，带宽返回 `0.0`）；
3. **Rust 原生性**：所有运算逻辑必须全部通过 `nodejs-polars` 的表达式（`pl.col`, `rollingMean`, `rollingStd`, `when/then`）在底层执行，严禁 JS/TS 命令式循环；
4. **无副作用纯度**：严禁引入 `@app/*`、`@nestjs/*`、TypeORM、Redis、环境变量或任何 I/O 依赖。

---

## 2. 算子行为规约

### 2.1 布林带算子 (`bollinger.ts`)

- **接口定义**：
  ```typescript
  export interface BollingerBandsSeriesResult {
    readonly begIndex: number;
    readonly upper: number[];
    readonly middle: number[];
    readonly lower: number[];
    readonly bandwidth: number[];
  }

  export interface BollingerBandsObservation {
    readonly upper: number;
    readonly middle: number;
    readonly lower: number;
    readonly bandwidth: number;
  }
  ```

- **数学公式**：
  $$\text{middle} = \text{rollingMean}(\text{prices}, \text{period})$$
  $$\text{std} = \text{rollingStd}(\text{prices}, \text{period})$$
  $$\text{upper} = \text{middle} + \text{stdDevMultiplier} \times \text{std}$$
  $$\text{lower} = \text{middle} - \text{stdDevMultiplier} \times \text{std}$$
  $$\text{bandwidth} = \frac{\text{upper} - \text{lower}}{\text{middle}}$$

- **行为规约**：
  - 输入：`prices: readonly number[]`，默认参数 `period = 20`，`stdDevMultiplier = 2.0`；
  - 当 `prices.length < period` 时，`computeBollingerBandsSeries` 返回空数组，`begIndex = prices.length`；`computeBollingerBandsObservation` 抛出 `IndicatorInputError`；
  - `bandwidth` 安全熔断：若 `middle <= 0`，带宽返回 `0.0`；
  - 对齐契约：输出长度满足 `upper.length === prices.length - begIndex`，且 `upper[i] === in[i + begIndex]`。

---

### 2.2 肯特纳通道算子 (`keltner.ts`)

- **接口定义**：
  ```typescript
  export interface KeltnerChannelsSeriesResult {
    readonly begIndex: number;
    readonly upper: number[];
    readonly middle: number[];
    readonly lower: number[];
  }

  export interface KeltnerChannelsObservation {
    readonly upper: number;
    readonly middle: number;
    readonly lower: number;
  }
  ```

- **数学公式**：
  $$\text{middle} = \text{rollingMean}(\text{closes}, \text{period})$$
  $$\text{atr} = \text{computeAtrSeries}(\text{highs}, \text{lows}, \text{closes}, \text{period})$$
  $$\text{upper} = \text{middle} + \text{atrMultiplier} \times \text{atr}$$
  $$\text{lower} = \text{middle} - \text{atrMultiplier} \times \text{atr}$$

- **行为规约**：
  - 输入：`highs, lows, closes: readonly number[]`，默认参数 `period = 20`，`atrMultiplier = 1.5`；
  - 当序列长度 `< period` 时，`computeKeltnerChannelsSeries` 返回空数组，`begIndex = closes.length`；`computeKeltnerChannelsObservation` 抛出 `IndicatorInputError`；
  - 底层 ATR 计算必须复用 Polars 原生 `computeAtrSeries`，保证向量化对齐与时间前沿一致性。
