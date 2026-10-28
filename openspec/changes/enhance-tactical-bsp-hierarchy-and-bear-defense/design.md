# Design: Enhance Tactical BSP Hierarchy And Bear Defense

## Context & Architecture Positioning

```text
                  ┌──────────────────────────────────────────────┐
                  │          宏观环境体制 (Setup Layer)            │
                  │   plugin.regime.shanghai-index (BULL/BEAR)   │
                  └──────────────┬───────────────────────────────┘
                                 │ Setup Gating (一票否决)
                                 ▼
   ┌─────────────────────────────────────────────────────────────┐
   │             结构形态扳机 (Trigger Layer - 双轨直出)           │
   │  【开源基线】: plugin.chan.bsp (标准几何 1/2/3 买卖)            │
   │  【私有增强】: plugin.tactics.bull-left-right-bsp             │
   │               ├── 1买: 极限1买 (超跌) / 盘整1买 (单中枢)        │
   │               ├── 2买: 左侧2买 (底分型) / 右侧2买 (过零) [≥ 1买]│
   │               └── 3买: 左侧3买 (贴边) / 右侧3买 (突破) [> ZG]  │
   │  【极端防守】: plugin.tactics.bear-left-right-bsp             │
   │               └── 跳空低开 / 破5日线 / 次级破零 (RISK_CUT)     │
   └──────────────┬───────────────────────────────┬──────────────┘
                  │                               │ 0 延迟极速切断
                  │ 时序观察窗 (3 根 Bar)          │ (windowBars: 0)
                  ▼                               ▼
   ┌───────────────────────────────┐ ┌───────────────────────────┐
   │ 战术共振买入 (Tactical ENTRY) │ │ 战术风控撤退 (Tactical CUT)│
   │   VPCI 放量突破 (+ 挤压加成)   │ │  即时清洗所有未决多头观察窗│
   └──────────────┬────────────────┘ └─────────────┬─────────────┘
                  │                                │
                  ▼                                ▼
          [SimulatedBroker 下根 Bar 撮合 / Notification 告警推送]
```

## Detailed Technical Decisions

### Decision 1: 熊市逃命战术卖点的零延迟（Zero-Delay）直通机制
- **问题**：逃命卖点（`BEAR_EXIT_GAP_DOWN`, `BEAR_EXIT_BREAK_MA5`, `BEAR_EXIT_SUB_BREAK_ZERO`）是否应进入时序观察窗？
- **裁决**：**绝对不进入观察窗**。
  - 必须声明为 `windowBars: 0` 与 `requiredConfirmationTags: []`；
  - `TemporalWindowEngine.push()` 命中零窗口规则时，直接调用 `createSinglePointEvent` 即刻返回，绝不进入排队；
  - `TacticalCooldownTracker` 现行逻辑已对 `event.kind !== 'ENTRY'` 100% 豁免，确保逃命卖点永不被冷却拦截；
  - 当逃命卖点到达时，触发 `updateSetupState()`，将所有等待中的多头买入观察窗**瞬时作废注销**，彻底消灭“系统一边逃命一边还在等待放量买入”的逻辑死锁。

### Decision 2: 缠论 1/2/3 买与多级别战术插件的六大状态机分层
- **问题**：如何在 `bull-left-right-bsp.plugin.ts` 内部优雅实现 1/2/3 买形态骨架与左右侧细分？
- **设计模型**：
  1. **状态机扩展（`SessionStateRecord`）**：
     ```typescript
     interface SessionStateRecord {
       // 1买跟踪
       lastFirstBuyPrice?: number;   // 1买确立时的形态极值低点
       lastFirstBuyTime?: number;    // 1买发生时刻
       hasPriorFirstBuy?: boolean;   // 是否确立过有效1买
       
       // 2买跟踪
       lastSecondBuyPrice?: number;
       hasPriorLeftBuy?: boolean;    // 既有兼容字段
       
       // 3买跟踪
       lastTargetCentral?: { zg: number; zd: number; gg?: number; dd?: number }; // 目标突破中枢
       breakoutConfirmed?: boolean;  // 价格已完成对中枢上沿 ZG 的向上脱离
     }
     ```
  2. **1买判决（反转之买）**：
     - **条件 A（极限左侧1买，`BUY_1B_EXTREME_LEFT`）**：次级别 5m MACD 负斜率超卖极值 + 金叉翻红，且当前处于宏观牛市或大跌尾声；
     - **条件 B（单中枢盘整1买，`BUY_1B_CONSOLIDATION`）**：价格低于中枢下沿 ZD，离开段相比进入段发生 MACD 面积背驰；
     - **状态更新**：记录 `lastFirstBuyPrice = currentLow`, `lastFirstBuyTime = currentTime`, `hasPriorFirstBuy = true`。
  3. **2买判决（确认之买）**：
     - **前置门禁**：必须存在 `hasPriorFirstBuy === true`，且当前回踩最低价 `currentLow >= lastFirstBuyPrice`；
     - **左侧 2 买（`BUY_2B_SUB_FENXING_LEFT`）**：回踩末端，5m 次级别确立底分型；
     - **右侧 2 买（`BUY_2B_SUB_CROSS_ZERO_RIGHT`）**：次级别 MACD DIF 突破 0 轴发散。
  4. **3买判决（主升突破之买）**：
     - **前置门禁**：必须曾突破中枢上沿（`breakoutConfirmed === true`），且本次次回抽最低价 `currentLow > lastTargetCentral.zg`；
     - **左侧 3 买（`BUY_3B_ZG_EDGE_LEFT`）**：回踩逼近 ZG 上方（距 ZG 缓冲在 1%~2% 内），5m 次级别确立底分型；
     - **右侧 3 买（`BUY_3B_FIRE_RIGHT`）**：次回抽不破 ZG 获得确认后，5m 次级别放量突破、MACD 零轴二次启动。

### Decision 3: 全量透传客观几何形态（Complete Geometry Payload），彻底消灭局部切片与旧判决
- **核心契约**：
  - 彻底丢弃老引擎的 `eventType`（`first_buy`, `second_buy`, `third_buy` 等硬编码判定），老引擎判定不作为前置依赖；
  - 不再让战术插件基于 K 线手工切片（`slice(-25)`, `slice(-40)`）去逆向猜测中枢和分型；
  - 全量透传纯客观几何形态骨架（`ChanGeometryPayload`），牛市和熊市插件对齐统一消费：
    * `channels`: 全量中枢序列，包含 `{ index, zg, zd, gg, dd, startTime, endTime, direction, isBeichi, enterForce, leaveForce }`；
    * `bis`: 全量笔序列，包含 `{ index, high, low, startPrice, endPrice, startTime, endTime, trend }`；
    * `fenxings`: 确立的顶底分型极值与时间；
  - 统一写入上下文黑板 `context.attributes.set('chan.geometry', geometry)`；
  - 牛市与熊市插件统一以完整几何形态为第一公民输入，并内置纯数学轻量自构建 fallback 确保 100% fail-safe。

### Decision 4: 双轨直出（Open-Core vs Private Alpha）与向后兼容
- `plugin.chan.bsp` 与 `plugin.tactics.bull-left-right-bsp` 在战术层保持平行的 Trigger 规则；
- 既有 `BUY_EXTREME_LEFT_1`、`BUY_SUB_FENXING_LEFT`、`BUY_SUB_CROSS_ZERO_RIGHT` 作为别名保留在 `displayTag` 或 `evidence.aliases` 中，确保存量前端图表与回测测试用例 100% 绿灯。

## Risks & Mitigations

| 风险点 | 影响面 | 缓解策略 |
|---|---|---|
| **中枢数据缺失** | 若上下文未注入中枢，3买无法计算 ZG | 在 `bull-left-right-bsp` 内部实现轻量中枢自构建（基于已合并的 K 线与分型），即使外部未注入中枢，也能自给自足识别局部中枢，保证 100% fail-safe。 |
| **2买价格漂移** | 长期震荡中历史 1买价格失效 | 设置 `MAX_FIRST_BUY_LOOKBACK_BARS = 120`，若超过 120 根 Bar 未触发 2买，历史 1买状态自动衰变重置。 |
| **熊市逃命频繁触发** | 震荡市跳空导致误斩仓 | 逃命规则仅针对空头信号（`action: SELL`），且 `edgePlugins` 已做跳变微分抑制，同一持续期内仅在首次跳变触发一次。 |
