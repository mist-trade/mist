# Proposal: Enhance Tactical BSP Hierarchy And Bear Defense

## Why

1. **多头战术买点缺乏中枢形态骨架与 1/2/3 买层级约束**：
   - 目前私有插件 `plugin.tactics.bull-left-right-bsp` 仅定义了扁平的左右侧买点（`BUY_EXTREME_LEFT_1`, `BUY_SUB_FENXING_LEFT`, `BUY_SUB_CROSS_ZERO_RIGHT`）；
   - 它没有与缠论核心的形态序列（1买反转、2买确认、3买主升突破）建立强约束状态机，导致在下跌中继频繁发射假买点（21 年共发 6,219 次信号）；
   - 人类工程师确立了清晰的架构方案：
     * **1买（反转之买）**：在牛市大体制下放宽，不苛求 2 中枢大趋势背驰，单中枢盘整背驰或 5m 极值即确立「牛市增强1买」；
     * **2买（确认之买）**：必须在 1买确立后且次回踩低点不跌破 1买极值（$P_{2B} \ge P_{1B}$）才成立，并细分为「左侧分型2买」与「右侧过零2买」；
     * **3买（主升突破之买）**：必须满足突破中枢后次回抽不跌回中枢上沿 $ZG$（$P_{3B} > ZG$），并细分为「左侧贴边3买」与「右侧放量突破3买」。

2. **战术汇聚层遗漏熊市极速逃命规则**：
   - 私有仓已实现 `plugin.tactics.bear-left-right-bsp`，内含三大极速逃命卖点（跳空低开卖、破5日线卖、次级破零卖）；
   - 现行 `DEFAULT_TACTICAL_AGGREGATOR_CONFIG.windows` 仅配置了多头买入规则，未声明熊市逃命卖点规则，导致风控断层；
   - 熊市逃命属于高优先级 `RISK_CUT`，必须零延迟（`windowBars: 0`）直出，且触发时必须即刻作废未决的多头买入观察窗。

## What Changes

1. **战术汇聚层注册熊市逃命风控规则**：
   - 在 `DEFAULT_TACTICAL_AGGREGATOR_CONFIG.windows` 中补充声明 `plugin.tactics.bear-left-right-bsp` 的逃命规则：`windowBars: 0`、`requiredConfirmationTags: []`、`compositeBadgeText: '熊市极速逃命'`、`action: 'SELL'`、`kind: 'RISK_CUT'`；
   - 逃命卖点到达时，0 延迟直出驱动消费层平仓，并在 `updateSetupState` 时清洗所有未决买入观察窗。

2. **`bull-left-right-bsp.plugin.ts` 状态机与 1/2/3 买结构分层**：
   - 扩展 `SessionStateRecord`，记录 `lastFirstBuyPrice`、`lastFirstBuyTime`、`lastConfirmedZhongshu`（`zg`, `zd`）与 `breakoutConfirmed`；
   - 实现三大层级精准战术信号输出：
     * **1买**：`BUY_1B_EXTREME_LEFT`（极限左侧1买）与 `BUY_1B_CONSOLIDATION`（单中枢盘整1买）；
     * **2买**：`BUY_2B_SUB_FENXING_LEFT`（左侧分型2买）与 `BUY_2B_SUB_CROSS_ZERO_RIGHT`（右侧过零2买），强校验 `retraceLow >= lastFirstBuyPrice`；
     * **3买**：`BUY_3B_ZG_EDGE_LEFT`（中枢上沿左侧3买）与 `BUY_3B_FIRE_RIGHT`（放量突破右侧3买），强校验 `retraceLow > lastConfirmedZhongshu.zg`；
   - 保持向后兼容：保留既有 displayTag 别名与 evidence 结构，杜绝破坏既有回测与前端渲染。

3. **双轨直出测试与回测验证**：
   - 在 `mist-alpha-private` 补充 1/2/3 买状态机单元测试；
   - 在 `mist` 战术汇聚层补充熊市逃命 0 延迟发射与多头窗口清洗集成测试。

## Capabilities

### New Capabilities
- `tactical-event-pipeline`：具备 0 延迟极速风控切断（`RISK_CUT`）直通能力与熊市逃命规则配置。
- `plugin.tactics.bull-left-right-bsp`：具备严格缠论几何中枢约束的 1买、2买、3买六大细分战术标签输出能力。

### Modified Capabilities
- `DEFAULT_TACTICAL_AGGREGATOR_CONFIG`：新增熊市极速逃命风控规则，形成完整多空闭环。
