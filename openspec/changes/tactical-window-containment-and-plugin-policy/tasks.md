# Tasks: Tactical Window Containment Keep-Alive and Autonomous Plugin Policy

- [x] 1. 公共仓缠论官方合并 K 线透传 (`mist`)
  - [x] 1.1 `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts`：扩充 `ChanGeometryPayload`（增加 `mergedKs`, `latestMergedIndex`, `isLatestContained`），在 `extractGeometry` 中调用 `ChanCore.mergeK(klines)` 注入黑板 `chan.geometry`
  - [x] 1.2 `libs/strategy/src/factor/plugins/chan-bsp.plugin.spec.ts`：补充 `mergedKs` 透传与包含标志单元测试

- [x] 2. 公共仓时序观察窗智能保活与自适应策略 (`mist`)
  - [x] 2.1 `libs/strategy/src/tactical-event/tactical-event.types.ts`：抽离导出全局常量 `DEFAULT_TACTICAL_WINDOW_BARS = 3`、`DEFAULT_MAX_CONTAINMENT_HOLD_BARS = 2`、`DEFAULT_TACTICAL_COOLDOWN_BARS = 3`，扩展 `TacticalWindowRule`
  - [x] 2.2 `libs/strategy/src/tactical-event/temporal-window-engine.ts`：开窗时提取 `signal.evidence` 自主策略；步进时实现 Inside Bar 包含保活与 `pivotPrice` 破位清退
  - [x] 2.3 `libs/strategy/src/tactical-event/temporal-window-engine.spec.ts`：新增孕线包含保活、连续包含超额清退、破位注销、信号策略覆盖等系列单测

- [x] 3. 全流程集成与门禁验证
  - [x] 3.1 运行公共仓四大门禁（`dev-server-boundary`, `strategy-boundary`, `strategy-dual-timestamp`, `strategy-pipeline-homogeneity`）
  - [x] 3.2 运行战术事件汇聚全量单元测试
  - [x] 3.3 `openspec validate tactical-window-containment-and-plugin-policy --strict --type change` 校验通过
