# 实施计划与任务分解 (tasks.md)

- [x] **阶段一：纯数学底层指标算子扩充 (`mist/libs/indicators` 基于 nodejs-polars)**
  - [x] **任务 1.1**：编写 `bollinger.spec.ts` 红灯测试，实现 `libs/indicators/src/bollinger.ts`（基于 Polars 向量化实现布林带上下轨、中轨与带宽，TA-Lib 双轨制 `computeBollingerBandsSeries` 与 `computeBollingerBandsObservation`）。
  - [x] **任务 1.2**：编写 `keltner.spec.ts` 红灯测试，实现 `libs/indicators/src/keltner.ts`（基于已实现的 ATR 与 Polars 向量化计算肯特纳通道上下轨与中轨，TA-Lib 双轨制 `computeKeltnerChannelsSeries` 与 `computeKeltnerChannelsObservation`）。
  - [x] **任务 1.3**：编写 `vpci.spec.ts` 红灯测试，实现 `libs/indicators/src/vpci.ts`（基于 Polars 向量化计算 VWMA、SMA、VPC、VPR、VM 及 VPCI 与平滑 SignalLine，TA-Lib 双轨制 `computeVpciSeries` 与 `computeVpciObservation`）。
  - [x] **任务 1.4**：在 `libs/indicators/src/index.ts` 中统一导出，运行纯数学边界门禁 `indicators-boundary.guard.spec.ts` 确保 100% PASS。

- [x] **阶段二：策略内核特征提取器与上下文装配 (`mist/libs/strategy`)**
  - [x] **任务 2.1**：在 `libs/strategy/src/factor/helpers/volume-features.extractor.ts` 实现特征提取器，将 `ProjectedStrategyBar[]` 转换为只读的 `VolumeFeaturesAttribute`（包含挤压蓄能/释放态、成交量 TsRank、RPP、ATR、VPCI 等）。
  - [x] **任务 2.2**：编写 `volume-features.extractor.spec.ts` 验证特征装配准确性，并支持在决策流执行时写入 `context.attributes.set('volumeFeatures', ...)`。
  - [x] **任务 2.3**：在 `strategy-evaluation-kernel.ts` 的 `buildContext` 中统一注入 `volumeFeatures`。

- [x] **阶段三：门禁、类型与端到端质检交付**
  - [x] **任务 3.1**：运行 `pnpm typecheck`，确保全局类型 0 报错。
  - [x] **任务 3.2**：运行 `pnpm check:magic`，更新 AST 魔法值门禁基线确保 100% 绿灯。
  - [x] **任务 3.3**：全量单元测试回归，验证 `libs/indicators` 与 `libs/strategy` 所有测试 100% PASS。

---

> 补正注记（2026-10-16）：本 change 的 spec 已由 flat 叙述文件转换为合法 delta 格式
> （`specs/volatility-indicators/spec.md`、`specs/vpci-indicator/spec.md`），并并入口径修正：
> BOLL 总体标准差 ddof=0（复用 `computeRollingStdSeries`）；特征提取器 VWAP 精确 amount 口径
> （`Σamount / Σvolume`）与 amount 不可用 fail-closed。实现由 `fix-indicator-conventions` 承接，
> 本 change 归档前须确认其已完成，否则修正不会进入 live spec。
