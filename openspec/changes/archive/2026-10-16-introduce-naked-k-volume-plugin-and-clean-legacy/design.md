# 架构设计方案：纯 Rust nodejs-polars 量价算力底座与存量死代码治理

## 1. 架构总览与纯数学边界约束

根据 `AGENTS.md` 刚性守门契约，`@app/indicators` 属于无副作用纯数学核心：
1. **纯粹性红线**：严禁引入 `@app/*`、`@nestjs/*`、TypeORM、Redis、环境变量或任何 I/O 依赖；
2. **Rust SIMD 向量化底座**：所有指标数学计算必须基于 `nodejs-polars` 实现，严禁 JS/TS 命令式循环；
3. **TA-Lib 双轨制契约**：全时序输出 `{ begIndex, ...arrays }` 满足 `out[i] === in[i + begIndex]`；尾部单截面输出纯标量。

```
       [行情时序数据 (OHLCV Arrays)]
                    │
                    ▼
       ┌────────────────────────────────────────────────────────┐
       │             @app/indicators (libs/indicators)          │
       │    100% Rust nodejs-polars DataFrame / Series SIMD     │
       ├────────────────────────────┬───────────────────────────┤
       │ 基础量能时序                │ 经典量价复合算子          │
       │ • computeVolumeSeries/Obs  │ • computeObvSeries/Obs    │
       │   (VMA5/10/20, VRatio)     │   (差分累加资金流向)      │
       │                            │ • computeVwapSeries/Obs   │
       │ 统计自适应分布             │   (加权成本线)            │
       │ • computeRppSeries/Obs     │                           │
       │   (rollingMin/Max 相对分位)│ 波动率与时序排名重构      │
       │                            │ • computeAtrSeries/Obs    │
       │                            │ • computeTsRankSeries/Obs │
       └────────────────────────────┴───────────────────────────┘
                    │
                    ▼ TA-Lib 双轨制规范返回
       [策略树 DecisionFlowEvaluator / 规则 DSL / 前端图表展示]
```

---

## 2. 6 大量价指标算子 Polars 表达式设计

### 2.1 VOL & Volume MA（`libs/indicators/src/volume.ts`）
- **核心逻辑**：
  ```typescript
  const s = pl.Series('volume', volumes).cast(pl.Float64);
  const vma5 = s.rollingMean(5).toArray() as (number | null)[];
  const vma10 = s.rollingMean(10).toArray() as (number | null)[];
  const vma20 = s.rollingMean(20).toArray() as (number | null)[];
  const vma5Series = pl.Series('vma5', vma5);
  const volumeRatio = s.divide(vma5Series).toArray() as (number | null)[];
  ```
- **双轨制**：
  - `computeVolumeSeries`：以最大周期 20 预热，`begIndex = 19`；
  - `computeVolumeObservation`：直接返回尾部截面。

### 2.2 OBV（`libs/indicators/src/obv.ts`）
- **核心逻辑**：
  ```typescript
  const df = pl.DataFrame({
    close: pl.Series('close', closes).cast(pl.Float64),
    volume: pl.Series('volume', volumes).cast(pl.Float64),
  });
  const diff = pl.col('close').diff(1);
  const sign = pl.when(diff.gt(0)).then(1).when(diff.lt(0)).then(-1).otherwise(0);
  const obv = df.select(pl.col('volume').mul(sign).cumSum().alias('obv')).getColumn('obv').toArray() as number[];
  ```
- **双轨制**：`begIndex = 0`，`computeObvObservation` 返回最新标量。

### 2.3 RPP 相对价格分位（`libs/indicators/src/rpp.ts`）
- **核心逻辑**：
  ```typescript
  const df = pl.DataFrame({
    high: pl.Series('high', highs).cast(pl.Float64),
    low: pl.Series('low', lows).cast(pl.Float64),
    close: pl.Series('close', closes).cast(pl.Float64),
  });
  const minLow = pl.col('low').rollingMin(window);
  const maxHigh = pl.col('high').rollingMax(window);
  const range = maxHigh.sub(minLow);
  const rppExpr = pl.when(range.gt(0)).then(pl.col('close').sub(minLow).divide(range)).otherwise(0.5);
  const rpp = df.select(rppExpr.alias('rpp')).getColumn('rpp').toArray() as (number | null)[];
  ```
- **双轨制**：`begIndex = window - 1`，保证无未来函数与历史越界。

### 2.4 VWAP 成交量加权均价（`libs/indicators/src/vwap.ts`）
- **核心逻辑**：
  ```typescript
  const df = pl.DataFrame({
    close: pl.Series('close', closes).cast(pl.Float64),
    volume: pl.Series('volume', volumes).cast(pl.Float64),
  });
  const pv = pl.col('close').mul(pl.col('volume'));
  const vwapExpr = window !== undefined
    ? pv.rollingSum(window).divide(pl.col('volume').rollingSum(window))
    : pv.cumSum().divide(pl.col('volume').cumSum());
  const vwap = df.select(vwapExpr.alias('vwap')).getColumn('vwap').toArray() as (number | null)[];
  ```
- **双轨制**：支持全时序累积模式与滚动窗口模式。

### 2.5 ATR 重构与双轨制补齐（`libs/indicators/src/atr.ts`）
- **重构重点**：
  - 剔除临时切片与原生 JS 操作，保持纯 Polars 流水线；
  - 补齐 `computeAtrObservation(high, low, close, period = 14): AtrObservation`。

### 2.6 TsRank 根除 TS 循环（`libs/indicators/src/time-series/ts-rank.ts`）
- **重构重点**：
  - 彻底删除手写循环 `computeWindowRank` 和主遍历 `for` 循环；
  - 采用 Polars 原生滚动分位表达式实现，实现 100% 内存向量化；
  - 补齐 `computeTsRankObservation`。

---

## 3. 存量代码纯化与治理方案

### 3.1 公共示范插件下线（`mist`）
- 下线 `libs/strategy/src/factor/plugins/volume-breakout.plugin.ts`；
- 同步更新 `standard-plugins.ts`、`external-isolation.guard.spec.ts`、`factor-plugin.controller.spec.ts` 中的断言基线。

---

## 4. 门禁与质检防护

1. **边界隔离门禁**：`libs/indicators/src/indicators-boundary.guard.spec.ts` 确保 0 违规引入；
2. **CI 单元测试**：针对 6 个指标编写 100% 覆盖率单测（边界：空数组、短序列、平盘、极大极小值）；
3. **性能基准守护**：万根 Bar 时序指标计算耗时低于 15ms。
