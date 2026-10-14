# Technical Design: Polars 向量化布林带、肯特纳通道与 VPCI 指标底座及特征提取器设计

## 1. 架构拓扑与特征管道

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 【libs/indicators】指标计算底座 (基于 nodejs-polars Rust SIMD 实现纯数学双轨制算子)│
│                                                                             │
│  ├── bollinger.ts: computeBollingerBandsSeries / Observation                │
│  ├── keltner.ts:   computeKeltnerChannelsSeries / Observation (基于 ATR)    │
│  └── vpci.ts:      computeVpciSeries / Observation (基于 VWMA 与 SMA)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 纯数学双轨制向量化运算
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 【libs/strategy】求值内核与特征装配管道                                      │
│                                                                             │
│  volume-features.extractor.ts:                                              │
│  • 将 K 线序列统一转换为标准量价与波动率指标特征                            │
│  • 统一计算布林带/肯特纳挤压态、VPCI偏离度、Volume TsRank、RPP、ATR 等      │
│                                                                             │
│  StrategyEvaluationKernel:                                                  │
│  • 在 buildContext 装配 FactorContext 时，将提取的量价特征写入黑板：        │
│    context.attributes.set('volumeFeatures', VolumeFeaturesAttribute)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ 只读标准接口注入 (FactorContext)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 因子插件体系 (FactorPlugin / 决策流节点)                                    │
│ • 通过 context.attributes.get('volumeFeatures') 纯上下文只读消费特征        │
│ • 实现因子决策与纯粹性物理隔离                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Rust SIMD 指标算子数学规格 (`libs/indicators`)

### 2.1 布林带算子 (`bollinger.ts`)
* **输入**：`prices: readonly number[]`, `period = 20`, `stdDevMultiplier = 2.0`
* **Polars 向量化流水线**：
  $$\text{middle} = \text{rollingMean}(\text{prices}, \text{period})$$
  $$\text{std} = \text{rollingStd}(\text{prices}, \text{period})$$
  $$\text{upper} = \text{middle} + \text{stdDevMultiplier} \times \text{std}$$
  $$\text{lower} = \text{middle} - \text{stdDevMultiplier} \times \text{std}$$
* **输出**：`BollingerBandsSeries { upper, middle, lower, bandwidth }` 与尾部切片 `BollingerBandsObservation`。

### 2.2 肯特纳通道算子 (`keltner.ts`)
* **输入**：`highs, lows, closes: readonly number[]`, `period = 20`, `atrMultiplier = 1.5`
* **Polars 向量化流水线**：
  $$\text{middle} = \text{rollingMean}(\text{closes}, \text{period})$$
  $$\text{atr} = \text{computeAtrSeries}(\text{highs}, \text{lows}, \text{closes}, \text{period})$$
  $$\text{upper} = \text{middle} + \text{atrMultiplier} \times \text{atr}$$
  $$\text{lower} = \text{middle} - \text{atrMultiplier} \times \text{atr}$$
* **输出**：`KeltnerChannelsSeries { upper, middle, lower }` 与尾部切片 `KeltnerChannelsObservation`。

### 2.3 VPCI 量价确认算子 (`vpci.ts`)
* **输入**：`prices, volumes: readonly number[]`, `shortPeriod = 5`, `longPeriod = 20`, `signalPeriod = 10`
* **Polars 向量化流水线**：
  $$\text{VWMA}_N = \frac{\text{rollingSum}(\text{prices} \times \text{volumes}, N)}{\text{rollingSum}(\text{volumes}, N)}$$
  $$\text{SMA}_N = \text{rollingMean}(\text{prices}, N)$$
  $$\text{VPC} = \text{VWMA}_{\text{long}} - \text{SMA}_{\text{long}}$$
  $$\text{VPR} = \frac{\text{VWMA}_{\text{short}}}{\text{SMA}_{\text{short}}} \Big/ \frac{\text{VWMA}_{\text{long}}}{\text{SMA}_{\text{long}}}$$
  $$\text{VM} = \frac{\text{rollingMean}(\text{volumes}, \text{short})}{\text{rollingMean}(\text{volumes}, \text{long})}$$
  $$\text{VPCI} = \text{VPC} \times \text{VPR} \times \text{VM}$$
  $$\text{SignalLine} = \text{rollingMean}(\text{VPCI}, \text{signalPeriod})$$
* **输出**：`VpciSeries { vpci, signalLine, vpc, vpr }` 与尾部切片 `VpciObservation`。

---

## 3. 上下文黑板特征接口契约 (`VolumeFeaturesAttribute`)

在 `FactorContext.attributes.get('volumeFeatures')` 中约定的标准只读模型：

```ts
export interface VolumeFeaturesAttribute {
  // 1. 波动率与挤压特征
  readonly isSqueezeOn: boolean;          // UpperBB < UpperKC && LowerBB > LowerKC
  readonly isSqueezeFired: boolean;       // 上一根处于 SqueezeOn，当根突破释放
  readonly bbBandwidth: number;
  readonly atr: number;

  // 2. 量能特征
  readonly volumeTsRank: number;          // 当期成交量在自身窗口的百分位 [0.0, 1.0]
  readonly volumeRatio: number;           // 当期成交量 / 5日均量比

  // 3. 价格与均价线特征
  readonly close: number;
  readonly open: number;
  readonly deltaPrice: number;            // close - open
  readonly vwap: number;                  // 当日成交均价线
  readonly rpp: number;                   // 当期收盘在窗口高低位的相对百分位 [0.0, 1.0]

  // 4. VPCI 量价确认特征
  readonly vpci: number;
  readonly vpciSignal: number;
  readonly vpc: number;
  readonly vpr: number;
}
```

---

## 4. 门禁与工程质检

1. **纯数学边界守护**：`libs/indicators/src/indicators-boundary.guard.spec.ts` 确保 `@app/indicators` 无任何 `@app/*` 或三方 I/O 依赖；
2. **TA-Lib 双轨制规范**：全时序数组与尾部标量观察切片严格对齐；
3. **AST 魔法字面量基线**：所有默认数学参数录入 AST 校验基线，杜绝无意义硬编码。
