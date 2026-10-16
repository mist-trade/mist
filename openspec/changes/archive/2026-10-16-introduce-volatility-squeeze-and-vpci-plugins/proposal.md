# Proposal: 引入 Polars 向量化布林带、肯特纳通道与 VPCI 指标底座及特征提取器

## 1. 为什么做（Why）

在量化策略体系中，价格、成交量与波动率是度量市场状态的三个核心物理维度：
* **价格（Price）**：市场买卖双方在特定时间切片的共识结果（Consensus）；
* **成交量（Volume）**：推进价格移动所付出的努力与真实动量（Effort & Momentum）；
* **波动率（Volatility）**：市场的温度、弹性与蓄能状态（State & Regime）。

为支撑上层策略树与各类因子插件对波动率和量价的高性能低延迟研判，同时严格遵照“奥卡姆剃刀原则”（绝不堆砌多重共线性的冗余指标），本变更旨在主仓实现以下基石算力能力：

1. **波动率通道指标底座 (`libs/indicators`)**：
   - **布林带 (Bollinger Bands)**：基于正态分布均方差（$2\sigma$）度量价格统计分布极值包络；
   - **肯特纳通道 (Keltner Channels)**：基于真实波幅（ATR）度量市场固有物理振幅；
   - 两者结合可直接判定波动率挤压蓄能与突破释放状态。

2. **量价确认指标底座 (`libs/indicators`)**：
   - **VPCI (Volume Price Confirmation Indicator)**：基于成交量加权移动均线（VWMA）与普通均线（SMA）的偏离度，度量资金真实参与度与顶底背离。

3. **策略内核特征提取器与黑板装配 (`libs/strategy`)**：
   - 在求值内核 `StrategyEvaluationKernel` 中引入 `volume-features.extractor.ts`；
   - 将向量化计算后的量价与波动率特征统一组装为 `VolumeFeaturesAttribute`，写入 `context.attributes.set('volumeFeatures', ...)`，供各类因子插件通过纯上下文单向只读获取。

## 2. 核心架构约束与设计考量（Architecture Guardrails）

1. **主仓 Rust SIMD 算力底座（`libs/indicators`）**：
   - 所有布林带、肯特纳通道与 VPCI 的底层数学运算，严格基于主仓 `nodejs-polars` 实现，纯无副作用，保持 TA-Lib 双轨制对齐；
   - 严禁任何 JS/TS 命令式循环，严禁引入第三方数学库。

2. **纯上下文只读契约（Pure Context Isolation）**：
   - 策略因子插件与底层指标库保持彻底解耦，统一由求值内核在 `FactorContext` 组装特征；
   - 插件通过 `context.attributes.get('volumeFeatures')` 只读消费，杜绝插件内部重复运算或依赖指标库实现。

3. **杜绝硬编码魔法数字**：
   - 所有统计参数（如 20 周期、2.0 倍标准差、1.5 倍 ATR、5/20/10 周期）均纳入 AST 魔法值审查基线。
