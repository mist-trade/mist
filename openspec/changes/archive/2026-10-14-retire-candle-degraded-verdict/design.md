# Design: 退役 candle-degraded-event-recovery（降级收口）

## 1. 退役依据（2026-10-15 取证）

- **实现删除史**：`a6ce18e5`（2026-08-09，`introduce-openobserve-otel-foundation`）删除
  `realtime-candle-health.service.ts(.spec)`、`realtime-market-observability.service.ts(.spec)`，
  类型挪入 `realtime-candle-health.types.ts` 后残留；`monitoring-health-alerts` spec 同时删除。
- **存活现实**：原始失败计数经 `candle-metrics.ts` 以 OTel gauges 导出（`mist_candle_sealed_total`
  / `_discard_total` / `_skip_total` / `_snapshot_overflow_total` / `_due_scan_failure_total` …），
  OO 侧可观测；累计 totals 被既有观测/审计消费，保留。
- **死亡面**（全部零消费，证据见 §3 清单）：窗口判定类型族、`*LastFailureAtMs` 时间戳、
  恢复窗口 env 与常量、mist-deploy 中无调用点的 `Assert-CandleHealth` 断言簇。

**决策**：退役（B），不重建（A）。理由：原始计数已在 OO 可观测，"生产 degraded" 判定属
OO 告警规则的天然职责；当前无实盘痛点驱动（用户 2026-10-15 拍板）。

## 2. Live spec 处理（house pattern）

沿用 chan-bsp 退役先例（`a1a99c8f`，2026-10-12）：

1. **tombstone 注记**（落地时写入手改）：live spec `openspec/specs/candle-degraded-event-recovery/spec.md`
   的 Purpose 顶部加：
   ```
   > [!NOTE] RETIRED / DEPRECATED (2026-10-15 retire-candle-degraded-verdict)
   > 退役说明 + 迁移去向（OpenObserve raw gauge exports / OO alert rules）。
   ```
   requirements **保留不动**（作为冻结契约与历史记录）。
2. **delta 留档**：本 change 的 `specs/candle-degraded-event-recovery/spec.md` 以
   `## REMOVED Requirements`（×5，含 Reason + Migration）记录正式退役。
3. **归档方式**：`openspec archive retire-candle-degraded-verdict --skip-specs`（纯 rename；
   REMOVED 不入 live —— 与 chan-bsp 先例一致，requirements 保留为冻结记录）。

## 3. 清理清单（file:line @ 2026-10-15，落地按内容匹配）

### 3.1 mist 仓

| 位置 | 删除内容 | 依据 |
|---|---|---|
| `apps/mist/src/realtime/candle/realtime-candle-health.types.ts:10-15` | `RealtimeQuantityRejectionObservation` | 仅被 HealthObservation 引用 |
| 同文件 `:20-33` | `RealtimeCandleDegradedReason`（14 值） | 零消费 |
| 同文件 `:95-116` | `RealtimeCandleHealthObservation` 整接口 | 零消费 |
| 同文件（`RealtimeCandleRuntimeObservation` 内） | 7 个 `*LastFailureAtMs` 字段（candle×3 / queue×2 / due×2） | 只写不读，verdict 专属 |
| 同文件 | 变为无用的 import（`RealtimeQuantityField` / `RealtimeQuantityRejectReason` / `RealtimeStrategyHandoffObservation`） | 随删除失效 |
| `realtime-market-data-product.service.ts` | 8 个私有 `*LastFailureAtMs` 字段 + 6 个写入点（`:231/:550/:602/:638/:714/:1058` 区）+ `runtimeObservation()` 暴露行（`:795-841` 区） | 同上 |
| `candle-finalizer.ts` | `CandleFinalizerDiagnostics.finalizationLastFailureAtMs`（`:32`）/ 私有字段（`:69`）/ 暴露（`:324`）/ 写入（`:368`） | 同上 |
| `candle-finalizer.spec.ts:343/364`、`realtime-market-data-product.service.spec.ts` | `*Ms` 断言更新/删除 | 随字段删除 |
| `libs/config/src/validation.schema.ts:215-…` | `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 声明 + 其 import | 部署未设、零读取 |
| `libs/config/src/realtime-candle.config.ts:47-52` | `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS` | 仅被上述 schema 引用 |

**保留不动**：`RealtimeCandleRuntimeObservation` 本体与全部 totals、`candle-metrics.ts` 全部
gauges、`open-candle-aggregator`（无 `*Ms`）。

### 3.2 mist-deploy 仓

| 位置 | 删除内容 | 依据 |
|---|---|---|
| `scripts/run-realtime-candle-shadow-hil.ps1:500-537` | `Assert-CandleHealth` 函数 | 主脚本零调用点；断言引用已退役 verdict |
| `scripts/test-realtime-candle-shadow-hil.ps1:86-128` | `$healthy/$recovered/$mixed/$infra/$staleCounters` fixture 与 `Assert-CandleHealth` 断言簇 | 同上 |

**保留**：`Get-CandleHealth` warn 桩（被 evidence 采集调用）、其余 HIL 逻辑。
**记录不处理（Observation）**：`Wait-CandleCandidate` 依赖 `Get-CandleHealth` 返回值，OO 化后
为降级行为；该函数与 `Get-CandleHealth` 的完整 OO 迁移属 mist-deploy 后续工作。

## 4. 验证

```bash
# mist
pnpm typecheck
npx jest apps/mist/src/realtime libs/config --watchman=false --forceExit
pnpm test:ci && pnpm check:magic && pnpm lint:check
grep -rn "RealtimeCandleHealthObservation\|degradedReasons\|DEGRADED_RECOVERY\|LastFailureAtMs" apps libs --include=*.ts   # 期望 0

# mist-deploy
pwsh-preview -File scripts/test-realtime-candle-shadow-hil.ps1        # 本机（macOS 为 pwsh-preview）
# 若 pwsh 不可用：PowerShell 语法解析 + push 后 test-deploy-scripts.yml 矩阵

# 规格
openspec validate retire-candle-degraded-verdict --strict
# 归档：openspec archive retire-candle-degraded-verdict --skip-specs + 人工核实 tombstone
```

## 5. 非目标

- 不建 OO 规则/看板、不重建判定（B 决策）；
- 不动 totals 累计计数与既有 OO 导出；
- 不动 chan-bsp 等既有 tombstone spec；
- 不修 mist-deploy 其他 OO 迁移遗留（仅 §3.2 Observation 记录）。
