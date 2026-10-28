# Tasks: Tactical Window Containment Keep-Alive and Autonomous Plugin Policy

- [x] 1. 公共仓缠论官方合并 K 线透传 (`mist`)
  - [x] 1.1 `libs/strategy/src/factor/plugins/chan-bsp.plugin.ts`：扩充 `ChanGeometryPayload`（增加 `mergedKs`, `latestMergedIndex`, `isLatestContained`），在 `extractGeometry` 中调用 `ChanCore.mergeK(klines)` 注入黑板 `chan.geometry`
  - [x] 1.2 `libs/strategy/src/factor/plugins/chan-bsp.plugin.spec.ts`：补充 `mergedKs` 透传与包含标志单元测试

- [x] 2. 公共仓时序观察窗智能保活与自适应策略 (`mist`)
  - [x] 2.1 `libs/strategy/src/tactical-event/tactical-event.types.ts`：抽离导出全局常量 `DEFAULT_TACTICAL_WINDOW_BARS = 3`、`DEFAULT_MAX_CONTAINMENT_HOLD_BARS = 2`、`DEFAULT_TACTICAL_COOLDOWN_BARS = 3`，扩展 `TacticalWindowRule`
  - [x] 2.2 `libs/strategy/src/tactical-event/temporal-window-engine.ts`：开窗时提取 `signal.evidence` 自主策略；步进时实现 Inside Bar 包含保活与 `pivotPrice` 破位清退
  - [x] 2.3 `libs/strategy/src/tactical-event/temporal-window-engine.spec.ts`：新增孕线包含保活、连续包含超额清退、破位注销、信号策略覆盖等系列单测

- [x] 3. 私有仓插件自治策略下沉与官方合并 K 线消费 (`mist-alpha-private`)
  - [x] 3.1 `src/plugins/bull-left-right-bsp.plugin.ts`：彻底废弃内部手写 `processInclusion`，优先消费官方 `geometry.mergedKs`；在 `paramSchema` 暴露参数，输出买点时自主在 `evidence` 附带 `windowBars`、`maxContainmentHoldBars` 与 `pivotPrice`
  - [x] 3.2 `src/plugins/bull-left-right-bsp.plugin.spec.ts`：验证官方合并 K 线消费与自适应策略输出

- [x] 4. 全流程集成与门禁验证
  - [x] 4.1 运行公共仓四大门禁（`dev-server-boundary`, `strategy-boundary`, `strategy-dual-timestamp`, `strategy-pipeline-homogeneity`）
  - [x] 4.2 运行私仓纯上下文隔离门禁（`pure-context-isolation.guard.spec.ts`）与全量 63+ 用例
  - [x] 4.3 `openspec validate --specs --strict` 校验通过
