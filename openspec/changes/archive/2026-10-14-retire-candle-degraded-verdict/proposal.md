# Proposal: 退役 candle-degraded-event-recovery（窗口化降级判定）

## Why

2026-08-09 的 OpenTelemetry 迁移（`a6ce18e5`，`introduce-openobserve-otel-foundation`）删除了
candle 降级判定的全部实现（`RealtimeCandleHealthService` / `RealtimeMarketObservabilityService`），
但 live spec `candle-degraded-event-recovery` 从未同步更新，造成 spec-实现脱钩（2026-10-14
断线审计发现并记录，见 `archive/2026-10-14-cleanup-dead-code-env-and-restore-ci` design §5）。

现状（2026-10-15 复核）：

- 原始失败计数仍通过 OTel gauges 导出（`mist_candle_*`，`candle-metrics.ts`），OO 侧可观测；
- 窗口化「degraded 判定」层不存在：`RealtimeCandleHealthObservation` / `degradedReasons`
  零消费、`REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 声明未被读取、
  `mist_realtime_candle_health` 指标缺位；
- `*LastFailureAtMs` 时间戳（verdict 专用支撑件）只写不读、零外部读者；
- mist-deploy candle shadow HIL 中 `Assert-CandleHealth` 及其测试夹具引用的正是该判定
  （主脚本已无任何调用点）。

**决策（2026-10-15，用户拍板）**：不按 OO/OTel 范式重建判定层（方案 A），采用**降级收口**
（方案 B）——退役该 capability 并清理全部空壳。未来若实盘出现「candle 链路静默降级」的
真实痛点，再按 OO 告警规则单独立项。

## What Changes

1. **Live spec 退役注记**（沿用 chan-bsp 退役先例 `a1a99c8f` 的 house pattern）：
   `candle-degraded-event-recovery` spec 的 Purpose 顶部加 `> [!NOTE] RETIRED / DEPRECATED`
   注记，requirements 作为冻结契约保留；本 change 的 spec delta 以 `## REMOVED Requirements`
   （×5）记录正式退役理由与迁移去向。
2. **mist 死壳清理**：删除 `RealtimeCandleHealthObservation` / `RealtimeCandleDegradedReason` /
   `RealtimeQuantityRejectionObservation` 类型；删除 `*LastFailureAtMs` 时间戳（类型字段 +
   采集写入簿记 + 相关 spec 断言）；删除 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS`
   声明与 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS` 常量。
3. **mist-deploy 断言退役**：candle shadow HIL 主脚本中无调用点的 `Assert-CandleHealth`
   与测试脚本中对应 fixture/断言块移除（其余 HIL 逻辑不动）。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `candle-degraded-event-recovery`: retire this capability because the windowed degraded
  verdict was removed by the OpenTelemetry migration and candle production health is now
  observed from raw OTel gauge exports on the OpenObserve side.

## Impact & Non-Goals

- **Impact**：`apps/mist/src/realtime/candle`（类型 / 服务 / spec）、
  `libs/config`（schema 声明 / 窗口常量）、`mist-deploy`（HIL 脚本 + 静态测试）。
  观测导出（`mist_candle_*`）与审计累计计数**不受影响**。
- **Non-Goals**：
  - 不新建 OO 告警规则 / 看板（按 B 决策，留给未来实盘痛点驱动）；
  - 不重建任何形式的进程内 degraded 判定；
  - 不清理 totals 累计计数（部分已有观测消费，其余为审计累计，保留）；
  - 不修复 mist-deploy HIL 的其他 OO 迁移遗留（如 `Wait-CandleCandidate` 的候选等待
    在告警桩下为降级行为），仅在 design 记录。
