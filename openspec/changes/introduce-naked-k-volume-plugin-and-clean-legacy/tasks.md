# 任务清单：纯 Rust nodejs-polars 量能基石指标库建设与存量死代码治理

- [x] **阶段一：6 大核心量价指标算子 Rust/Polars 向量化实现 (`libs/indicators`)**
  - [x] 1.1 实现 `volume.ts`（VOL, VMA5/10/20, VolumeRatio）与 `volume.spec.ts`（双轨制测试与极端零成交量测试）
  - [x] 1.2 实现 `obv.ts`（能量潮累加流向）与 `obv.spec.ts`（涨跌平盘边界与累和对齐测试）
  - [x] 1.3 实现 `rpp.ts`（相对价格分位）与 `rpp.spec.ts`（滚动高低位极值与平盘 0.5 熔断测试）
  - [x] 1.4 实现 `vwap.ts`（成交量加权均价线）与 `vwap.spec.ts`（全时序累积模式与滚动窗口模式双轨测试）
  - [x] 1.5 重构 `atr.ts`（消除手写切片，纯 Polars 向量化）并补齐 `computeAtrObservation` 尾部切片与单测
  - [x] 1.6 重构 `time-series/ts-rank.ts`（彻底删除手写 TS for 循环，Polars 滚动分位计算）并补齐双轨制与单测
  - [x] 1.7 导出统一指标接口并确保 `indicators-boundary.guard.spec.ts` 纯数学边界测试 100% 通过

- [x] **阶段二：公共仓存量死代码与遗留展示插件清理 (`mist`)**
  - [x] 2.1 删除公共仓过时的遗留演示插件 `libs/strategy/src/factor/plugins/volume-breakout.plugin.ts`
  - [x] 2.2 更新 `standard-plugins.ts`、`factor-plugin.controller.spec.ts` 与 `external-isolation.guard.spec.ts` 基线断言

- [x] **阶段三：门禁、类型检查与全量质量保证**
  - [x] 3.1 运行 `pnpm typecheck` 验证全仓类型 100% 正常
  - [x] 3.2 运行 AST 魔法值检测并同步更新 `tools/audit/baseline-magic-literals.json`
  - [x] 3.3 运行全量测试套件确保无回归
