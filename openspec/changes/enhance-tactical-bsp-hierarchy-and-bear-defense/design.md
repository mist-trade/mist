# Design: Enhance Tactical Event Pipeline Risk Cut and Geometry Context

## Context & Architecture Positioning

```text
                  ┌──────────────────────────────────────────────┐
                  │          宏观环境体制 (Setup Layer)            │
                  │              Setup Gating (一票否决)          │
                  └──────────────┬───────────────────────────────┘
                                 │
                                 ▼
   ┌─────────────────────────────────────────────────────────────┐
   │             结构形态扳机 (Trigger Layer)                     │
   │  【标准买卖点】: plugin.chan.bsp (标准几何买卖点)              │
   │  【风控止损点】: 紧急风控 / 极速避险 (RISK_CUT)                │
   └──────────────┬───────────────────────────────┬──────────────┘
                  │                               │ 0 延迟极速切断
                  │ 时序观察窗 (多根 Bar 确认)     │ (windowBars: 0)
                  ▼                               ▼
   ┌───────────────────────────────┐ ┌───────────────────────────┐
   │ 战术共振买入 (Tactical ENTRY) │ │ 战术风控撤退 (Tactical CUT)│
   │      放量突破 / 动量共振确认   │ │  即时清洗所有未决多头观察窗│
   └──────────────┬────────────────┘ └─────────────┬─────────────┘
                  │                                │
                  ▼                                ▼
          [SimulatedBroker 下根 Bar 撮合 / Notification 告警推送]
```

## Detailed Technical Decisions

### Decision 1: 紧急风控事件的零延迟（Zero-Delay）直通机制
- **裁决**：
  - 声明为 `windowBars: 0` 与 `requiredConfirmationTags: []`；
  - `TemporalWindowEngine.push()` 命中零窗口规则时，直接调用 `createSinglePointEvent` 即刻返回，绝不进入排队；
  - `TacticalCooldownTracker` 现行逻辑已对 `event.kind !== 'ENTRY'` 100% 豁免，确保逃命卖点永不被冷却拦截；
  - 当紧急风控到达时，触发 `updateSetupState()`，将所有等待中的多头买入观察窗**瞬时作废注销**，彻底消灭“系统一边逃命一边还在等待放量买入”的逻辑死锁。

### Decision 2: 全量透传客观几何形态（Complete Geometry Payload）
- **核心契约**：
  - 全量透传纯客观几何形态骨架（`ChanGeometryPayload`）：
    * `channels`: 全量中枢序列，包含 `{ index, zg, zd, gg, dd, startTime, endTime, direction, isBeichi, enterForce, leaveForce }`；
    * `bis`: 全量笔序列，包含 `{ index, high, low, startPrice, endPrice, startTime, endTime, trend }`；
    * `fenxings`: 确立的顶底分型极值与时间；
  - 统一写入上下文黑板 `context.attributes.set('chan.geometry', geometry)`；
  - 下游插件统一以完整几何形态为第一公民输入。
