# 领域行为规范：VPCI 量价确认指标与特征提取器规约

## 1. VPCI 量价确认算子 (`vpci.ts`)

### 1.1 接口定义
```typescript
export interface VpciSeriesResult {
  readonly begIndex: number;
  readonly vpci: number[];
  readonly signalLine: number[];
  readonly vpc: number[];
  readonly vpr: number[];
}

export interface VpciObservation {
  readonly vpci: number;
  readonly signalLine: number;
  readonly vpc: number;
  readonly vpr: number;
}
```

### 1.2 数学规约 (Buff Dormeier VPCI)
- **输入**：`prices, volumes: readonly number[]`，参数 `shortPeriod = 5`, `longPeriod = 20`, `signalPeriod = 10`；
- **Polars SIMD 向量化计算**：
  $$\text{VWMA}_N = \frac{\text{rollingSum}(\text{prices} \times \text{volumes}, N)}{\text{rollingSum}(\text{volumes}, N)}$$
  $$\text{SMA}_N = \text{rollingMean}(\text{prices}, N)$$
  $$\text{VPC} = \text{VWMA}_{\text{long}} - \text{SMA}_{\text{long}}$$
  $$\text{VPR} = \frac{\text{VWMA}_{\text{short}}}{\text{SMA}_{\text{short}}} \Big/ \frac{\text{VWMA}_{\text{long}}}{\text{SMA}_{\text{long}}}$$
  $$\text{VM} = \frac{\text{rollingMean}(\text{volumes}, \text{short})}{\text{rollingMean}(\text{volumes}, \text{long})}$$
  $$\text{VPCI} = \text{VPC} \times \text{VPR} \times \text{VM}$$
  $$\text{SignalLine} = \text{rollingMean}(\text{VPCI}, \text{signalPeriod})$$

### 1.3 行为规约
- 最小序列长度门限：$\text{minRequired} = \text{longPeriod} + \text{signalPeriod} - 1 = 29$；
- 当 `prices.length < minRequired` 时，`computeVpciSeries` 返回空数组，`begIndex = prices.length`；`computeVpciObservation` 抛出 `IndicatorInputError`；
- 浮点除 0 保护：若分母成交量和为 0 或均线为 0，安全回退为 `1.0`。

---

## 2. 量价特征提取器与上下文契约 (`volume-features.extractor.ts`)

### 2.1 提取器行为
- 接收 `bars: readonly ProjectedStrategyBar[]`；
- 提取 OHLCV 数值序列，统一调用 `@app/indicators` 底座指标算子（Bollinger、Keltner、VPCI、RPP、ATR、VWAP、TsRank）；
- 产出轻量只读对象 `VolumeFeaturesAttribute`。

### 2.2 上下文黑板装配
- 在 `StrategyEvaluationKernel.buildContext()` 中，将提取的量价特征写入黑板：
  ```typescript
  context.attributes.set('volumeFeatures', extractVolumeFeatures(bars));
  ```
- 任何因子插件（FactorPlugin）均可通过只读标准接口 `context.attributes.get('volumeFeatures')` 获取上述量价与波动率特征，无需在插件内部重复导入重量级数学库。
