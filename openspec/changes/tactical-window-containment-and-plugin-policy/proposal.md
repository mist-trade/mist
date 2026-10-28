# Proposal: Tactical Window Containment Keep-Alive and Autonomous Plugin Policy

## Why

1. **时序观察窗在微观孕线包含停顿下的误杀隐患 (Inside Bar False Expiration)**：
   - 现行 `TemporalWindowEngine` 严格以每根物理 Bar 递增 1 扣减窗口倒计时（`currentBarIndex - triggerBarIndex <= windowBars`）；
   - 在缠论形态学与市场微观结构中，形态拐点确立后，经常出现 1~2 根窄幅震荡的内包含十字星（孕线）。此时缠论形态时钟完全静止，微观资金处于极度缩量蓄势；
   - 物理观察窗若死板数 3 根物理 Bar，会在孕线刚走完时误判为“超时过期”直接销毁。当随后主力大阳线放量突破、量价指标（VPCI）给出绝佳确认时，观察窗已经死亡，导致教科书级别的高信噪比买点被系统完全遗漏。

2. **系统汇聚层硬编码策略参数违背插件自治原则 (Monolithic Config vs Plugin Autonomy)**：
   - 现行 `DEFAULT_TACTICAL_AGGREGATOR_CONFIG` 在系统层写死了所有规则的 `windowBars: 3`、`cooldownBars: 3`；
   - 触发信号的插件本身（Trigger Plugin）最懂自己的形态特性（如 1买抄底需要更多蓄势耐心，3买突破讲究迅猛爆发，逃命风控需要 0 延迟秒出）；
   - 将参数硬编码在系统层导致公共仓与私有插件强耦合，每次新增插件或微调参数都需要修改公共系统配置。

3. **缠论官方包含合并 K 线未全量透传 (Missing Merged K-Line Geometry)**：
   - `ChanBspFactorPlugin.extractGeometry()` 目前仅向黑板透传了中枢（`channels`）和笔（`bis`），遗漏了由 `ChanCore.mergeK()` 权威产出的合并 K 线（`ChanMergedK[]`）；
   - 下游私有战术插件拿不到官方合并 K 线，只能被迫在私仓各自手写粗糙的临时合并逻辑，带来逻辑漂移与重复造轮子风险。

## What Changes

1. **缠论插件全量透传官方合并 K 线 (`ChanGeometryPayload`)**：
   - 在 `ChanGeometryPayload` 中正式增加 `mergedKs: readonly ChanMergedKGeometry[]`、`latestMergedIndex: number` 以及 `isLatestContained: boolean`；
   - `ChanBspFactorPlugin` 调用 `ChanCore.mergeK(klines)` 生成官方合并 K 线并注入黑板 `chan.geometry`。

2. **时序观察窗智能保活机制 (`TemporalWindowEngine`)**：
   - 推进物理 Bar 时，若当根 Bar 构成内包含/孕线（`high <= prevHigh && low >= prevLow`）且未跌破形态止损底线 `pivotPrice`：
     * 系统判定为微观缩量蓄势，**挂起（Freeze）有效窗口倒计时消耗**；
     * 允许最多弹性保活 `maxContainmentHoldBars` 根（默认 2 根，防止死鱼行情无限僵尸驻留）；
   - 若收盘价跌破形态止损底线 `pivotPrice`，**一票否决即刻注销窗口**；
   - 走出非包含的有效展开 Bar 时，正常扣减 1 根有效倒计时。

3. **插件级战术策略自洽下沉 (Autonomous Tactical Policy)**：
   - 抽离全局语义基准常量（`DEFAULT_TACTICAL_WINDOW_BARS = 3`、`DEFAULT_MAX_CONTAINMENT_HOLD_BARS = 2`、`DEFAULT_TACTICAL_COOLDOWN_BARS = 3`）；
   - `TemporalWindowEngine` 开窗时，**优先读取触发信号自身携带的策略**（`signal.evidence?.windowBars`、`signal.evidence?.maxContainmentHoldBars`）；
   - 触发插件（如 `bull-left-right-bsp`）通过 `paramSchema` 暴露参数，并在输出信号时在 `evidence` 中自主下发当前买点形态（1买/2买/3买）的自适应参数，系统汇聚层零侵入。

4. **私有仓消费统一与死代码清理**：
   - `bull-left-right-bsp.plugin.ts` 废弃私仓手写的 `processInclusion()`，100% 消费黑板官方 `geometry.mergedKs`；
   - 统一对齐全量单元测试与门禁。

## Capabilities

### New Capabilities
- `tactical-event-pipeline`：具备内包含/孕线（Inside Bar）智能保活能力与形态止损破位即刻清退能力。
- `tactical-event-pipeline`：具备根据触发信号携带的动态策略自适应设置窗口生命周期与保活上限的能力。
- `chan-bsp.plugin`：具备向黑板全量透传官方缠论合并 K 线（`mergedKs`）与包含状态标志的能力。

### Modified Capabilities
- `DEFAULT_TACTICAL_AGGREGATOR_CONFIG`：参数全面常量化解耦，允许规则与信号自由覆盖。
