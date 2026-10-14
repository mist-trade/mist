# 提案：纯 Rust nodejs-polars 量能基石指标库建设与存量死代码治理

## 1. 业务背景与现实痛点

在 Mist 量化策略体系中，“成交量（Volume）与成交额（Amount）”是识别资金异动、衡量筹码分歧与确认真假突破的关键维度。经全仓代码审计，当前算力底座与策略体系存在以下核心痛点：

1. **量能指标库空白**：`libs/indicators` 长期缺少独立的成交量基础指标（VOL/VMA）、量价流向指标（OBV）、相对价格分位指标（RPP）与均价线（VWAP）；
2. **架构红线违规与双轨制缺失**：
   - `ts-rank.ts` 虽然引入了 Polars，但核心计算仍充斥着 TypeScript 手写 `for` 循环切片与手动计数，违背了 `AGENTS.md` 中“必须严格基于 Rust `nodejs-polars` SIMD 表达式，严禁 JS/TS 命令式循环”的刚性架构红线；
   - `atr.ts` 仅实现了 `computeAtrSeries`，缺失 `computeAtrObservation` 尾部切片算子，破坏了 TA-Lib 双轨制契约；
3. **存量死代码与遗留 Demo 残留**：
   - `libs/strategy` 中残留的 `volume-breakout.plugin.ts` 仅为早期展示 Demo，未接入生产流水线，造成维护负担。

## 2. 价值主张与工程目标

本规范确立**“算力底座先行，指标先行，存量治理”**的演进路径：
1. **构建 100% Rust `nodejs-polars` 量能算力引擎**：
   - 彻底淘汰 TS 手写循环，全部采用 Polars 向量化表达式与原生 SIMD 算子；
   - 交付 6 大核心量价算子：
     - `VOL & VMA`（成交量均线与量比）
     - `OBV`（能量潮 / 资金流向净累积）
     - `RPP`（相对价格高低位分位）
     - `VWAP`（成交量加权均价线）
     - `ATR`（真实波幅标尺：全面 Polars 纯净重构 + 补齐双轨制）
     - `TsRank`（时序分位数：根除 TS 循环，全面迁移至 Polars + 补齐双轨制）
2. **刚性 TA-Lib 双轨制对齐**：
   - 每个指标均提供全时序数组 `compute*Series`（`out[i] === in[i + begIndex]`）与尾部标量切片 `compute*Observation`；
3. **公共仓死代码治理**：
   - 下线公共仓过时的遗留展示插件 `volume-breakout.plugin.ts`，同步更新标准插件测试与 AST 魔法值审查基线。
