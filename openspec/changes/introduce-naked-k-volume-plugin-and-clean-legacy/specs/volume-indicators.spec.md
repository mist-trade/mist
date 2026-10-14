# 领域行为规范：6 大量价核心指标算子规约 (基于 nodejs-polars)

## 1. 纯算力核心通用原则

1. **输入防御**：所有指标在输入数组长度不足以完成最小计算窗口（`length < minRequired`）时，`compute*Series` 返回 `{ begIndex: length, ...arrays: [] }`；`compute*Observation` 抛出标准 `IndicatorInputError`；
2. **浮点安全**：指标内部必须对除以 0、全平盘序列、空数组做安全熔断（如平盘分位返回 `0.5`，除以 0 均量量比返回 `1.0`）；
3. **Rust 原生性**：所有运算逻辑必须全部通过 `nodejs-polars` 的表达式（`pl.col`, `rollingMean`, `rollingMin`, `rollingMax`, `diff`, `cumSum`, `when/then`）在底层执行，严禁 JS/TS 命令式循环。

---

## 2. 算子行为规约

### 2.1 VOL & Volume MA (`volume.ts`)
- **接口定义**：
  ```typescript
  export interface VolumeSeriesResult {
    readonly begIndex: number;
    readonly volumes: number[];
    readonly vma5: number[];
    readonly vma10: number[];
    readonly vma20: number[];
    readonly volumeRatio: number[];
  }
  export interface VolumeObservation {
    readonly volume: number;
    readonly vma5: number;
    readonly vma10: number;
    readonly vma20: number;
    readonly volumeRatio: number;
  }
  ```
- **行为规约**：
  - 输入：`volumes: readonly number[]`，必须为非负浮点数组；
  - 当序列长度 `< 20` 时，`Series` 返回空数组；
  - `volumeRatio` 严格以当期量除以 5 日平滑均量 `vma5`；若 `vma5 === 0`，安全兜底为 `1.0`。

### 2.2 OBV (`obv.ts`)
- **接口定义**：
  ```typescript
  export interface ObvSeriesResult {
    readonly begIndex: number;
    readonly obv: number[];
  }
  export interface ObvObservation {
    readonly obv: number;
  }
  ```
- **行为规约**：
  - 首根 Bar 的 OBV 初始值为首根自身的 `volume`（若涨）或 `0`；
  - 随后每根 Bar：`close[i] > close[i-1]` 时加上 `volume[i]`；`close[i] < close[i-1]` 时减去 `volume[i]`；平盘不变；
  - 全流程利用 Polars `cumSum` 单次向量化求出。

### 2.3 RPP (`rpp.ts`)
- **接口定义**：
  ```typescript
  export interface RppSeriesResult {
    readonly begIndex: number;
    readonly rpp: number[];
  }
  export interface RppObservation {
    readonly rpp: number;
  }
  ```
- **行为规约**：
  - 在窗口 `window` 内，取 `maxHigh` 与 `minLow`；
  - 若 `maxHigh === minLow`（全平盘，无振幅），`rpp` 恒定返回 `0.5`；
  - 输出严格裁剪限制在 `[0.0, 1.0]` 闭区间内。

### 2.4 VWAP (`vwap.ts`)
- **接口定义**：
  ```typescript
  export interface VwapSeriesResult {
    readonly begIndex: number;
    readonly vwap: number[];
  }
  export interface VwapObservation {
    readonly vwap: number;
  }
  ```
- **行为规约**：
  - 默认全时序累加加权均价；当传入 `window` 参数时切换为滑动窗口加权均价；
  - 若累积成交量为 0，安全返回当根收盘价。

### 2.5 ATR 重构与双轨制补齐 (`atr.ts`)
- **接口定义**：
  ```typescript
  export interface AtrSeriesResult {
    readonly begIndex: number;
    readonly atr: number[];
  }
  export interface AtrObservation {
    readonly atr: number;
  }
  ```
- **行为规约**：
  - 补齐 `computeAtrObservation`，在单步推演中直接获取当期最新 ATR 标量；
  - 消除临时 JS 数组拷贝，全部在 Polars 内部由 Wilder RMA 递归完成。

### 2.6 TsRank 纯 Polars 向量化 (`ts-rank.ts`)
- **接口定义**：
  ```typescript
  export interface TsRankObservation {
    readonly rank: number;
  }
  ```
- **行为规约**：
  - 彻底淘汰手写 `for` 循环切片；
  - 输出分位数归一化到 `[0.0, 1.0]`；平窗返回 `0.5`；
  - 补齐 `computeTsRankObservation`。
