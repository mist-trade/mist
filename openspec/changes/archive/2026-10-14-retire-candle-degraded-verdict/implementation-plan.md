# Implementation Plan: retire-candle-degraded-verdict

> 三步工作流第 2 步产物（spec 四件套已确认，2026-10-15；`openspec validate --strict` 已通过）。
> 落地仓库：**mist**（主）+ **mist-deploy**（HIL 断言退役）。
> 约定：行号 = HEAD `0ec29afd`（2026-10-15），仅定位；编辑一律按内容匹配。

## §0 取证基线

| 项 | 结论 |
|----|------|
| verdict 家族零消费 | `RealtimeCandleHealthObservation` / `RealtimeCandleDegradedReason` / `RealtimeQuantityRejectionObservation` 仅存在于 `realtime-candle-health.types.ts` 自身 |
| `*LastFailureAtMs` 读者 | 全仓零外部读者（写入方：product.service / candle-finalizer + 2 个 spec 断言） |
| env/常量 | `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 仅声明（validation.schema.ts:215）零读取；`REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS` 仅被上述 schema 引用；部署侧未设置 |
| tsconfig | `noUnusedLocals` / `noUnusedParameters` 均开启 → 删除后必须同步收窄签名/清理局部变量 |
| mist-deploy | `Assert-CandleHealth`（主脚本 :500-537）零调用点；测试脚本 :86-128 调用它；`Get-CandleHealth` / `Wait-CandleHealth` 仍在使用（:1072 / :193），保留 |
| house pattern | tombstone + requirements 冻结保留（chan-bsp 先例 `a1a99c8f`）；归档 `--skip-specs` |

## §1 Phase 1：Live spec 退役（两个动作）

### 1.1 Tombstone 注记（落地时手改 live spec）
`openspec/specs/candle-degraded-event-recovery/spec.md` 的 `## Purpose` 行后插入：

```markdown
> [!NOTE] RETIRED / DEPRECATED (2026-10-15 retire-candle-degraded-verdict)
> The windowed degraded verdict was removed with the OpenTelemetry migration
> (`introduce-openobserve-otel-foundation`); candle production health is observed from raw OTel
> gauges (`mist_candle_*`) on the OpenObserve side. The requirements below are kept as the
> frozen retirement record. See `backend-candle-pipeline-observability`.
```

requirements 原样保留。

### 1.2 Delta（已写就，无需改动）
`specs/candle-degraded-event-recovery/spec.md`：`## REMOVED Requirements` ×5（Reason + Migration），
`validate --strict` 已通过。

## §2 Phase 2：mist 死壳清理（逐文件）

### 2.1 `apps/mist/src/realtime/candle/realtime-candle-health.types.ts`
- 删 `RealtimeQuantityRejectionObservation`（:10-15）、`RealtimeCandleDegradedReason`（:20-33）、
  `RealtimeCandleHealthObservation`（:95-116）；
- 删 `RealtimeCandleRuntimeObservation` 内 7 个字段：
  `candle.finalizationLastFailureAtMs` / `finalizationHorizonExceededLastFailureAtMs` /
  `recoveryGapLastFailureAtMs`、`queue.snapshotOverflowLastFailureAtMs` /
  `dueAdmissionOverflowLastFailureAtMs`、`due.scanLastFailureAtMs` / `registrationLastFailureAtMs`；
- 清理失效 import：`RealtimeQuantityField`、`RealtimeQuantityRejectReason`、
  `RealtimeStrategyHandoffObservation`（`CandleFinalizerDiagnostics` / `RealtimeSource` 保留）。
- 其余不动（`RealtimeCandleRuntimeObservation` 本体与 totals 保留）。

### 2.2 `apps/mist/src/realtime/candle/realtime-market-data-product.service.ts`
- 删 6 个私有字段（`:105/:107/:109/:123/:125/:127`）；
- 删写入：
  - `:231` `this.snapshotOverflowLastFailureAtMs = acceptedAt;`（`acceptedAt` 仍被上游使用，安全）
  - `:543-551` 注释 + `const deterministic = …` + `if (!deterministic) { … }` 整块
    （`deterministic` 唯一用途即时间戳刷新；整块删除）
  - `:602` / `:638` / `:714` / `:1058` 各赋值行（`now` / `this.clock.now()` 在相邻语句仍有使用，
    仅删赋值行）
- 删 `runtimeObservation()` 暴露行：`:795`、`:797-798`、`:827`、`:829-830`、`:833`、`:839`、`:841`。
- 验证兜底：`noUnusedLocals` 若报未用变量，按报错清理。

### 2.3 `apps/mist/src/realtime/candle/candle-finalizer.ts`
- 删 `CandleFinalizerDiagnostics.finalizationLastFailureAtMs`（:32）、私有字段（:69）、
  `diagnostics()` 暴露（:324）、`recordFinalizationFailure` 内写入（:368）。
- **签名收窄**：`recordFinalizationFailure(recordLimitBreach = false, deterministic = false, nowMs = 0)`
  → `recordFinalizationFailure(recordLimitBreach = false)`；同步：
  - 8 个调用点（:132/:143/:192/:209/:260/:270/:291/:295）去除多余实参；
  - 更新 JSDoc（删除 deterministic / nowMs 相关描述与窗口判定表述）；
  - 若调用方局部 `nowMs` 变为未使用，一并清理（typecheck 兜底）。
- `finalizationFailureTotal` / `recordLimitBreachTotal` 保留（totals）。

### 2.4 `libs/config`
- `validation.schema.ts`：删 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 块（:215 起）+ 其 import 中
  的 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS`（import 块 :2-7）。
- `realtime-candle.config.ts`：删 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS`（:47-52 含注释）。

### 2.5 测试更新
- `candle-finalizer.spec.ts`：
  - `'records a transient MULTI/EXEC failure with a last-failure timestamp'` → 改名为
    `'records a transient MULTI/EXEC failure'`，删 `finalizationLastFailureAtMs: nowMs` 断言
    （totals 断言保留）；
  - `'does not refresh the last-failure timestamp for a deterministic expired trading day'`
    → 整体删除（唯一被测行为即已退役的时间戳）。
- `realtime-market-data-product.service.spec.ts`：删 `:799-803` 的时间戳断言
  （注释 + `(service as any).finalizationHorizonExceededLastFailureAtMs` 断言；其余断言保留）。

### 2.6 Phase 2 验证
```bash
pnpm typecheck
npx jest apps/mist/src/realtime libs/config --watchman=false --forceExit
grep -rn "RealtimeCandleHealthObservation\|degradedReasons\|DEGRADED_RECOVERY\|LastFailureAtMs" apps libs --include=*.ts   # 期望 0
```

## §3 Phase 3：mist-deploy HIL 断言退役

- `scripts/run-realtime-candle-shadow-hil.ps1`：删 `Assert-CandleHealth` 函数（:500-537，含尾随空行）；
  `Get-CandleHealth` / `Wait-CandleHealth` / evidence 采集与其余逻辑不动。
- `scripts/test-realtime-candle-shadow-hil.ps1`：删 `$healthy` fixture 起至 `$staleCounters` 断言止
  的整块（:86-128，含其中 windowed 判定注释）；其余断言（含 `Wait-CandleHealth` 静态字符串检查）
  不动。
- 本地验证（条件）：
  ```bash
  command -v pwsh-preview && pwsh-preview -File scripts/test-realtime-candle-shadow-hil.ps1
  ```
  不可用则做语法解析检查，最终以 push 后 `test-deploy-scripts.yml` 矩阵为准。

## §4 Phase 4：落地安排

- **worktree（mist）**：`.worktrees/retire-candle-degraded-verdict` + 分支 `retire/candle-degraded-verdict`；
  `ln -s ../../node_modules node_modules`。**mist-deploy** 主树直改。
- **提交切分**：
  1. mist（主树，先提交）：`docs(openspec): add retire-candle-degraded-verdict change and implementation plan`
  2. mist（worktree）：`refactor(candle): retire degraded verdict shells and last-failure timestamps`
  3. mist（主树，合并后）: tombstone + 归档：先加 tombstone 提交
     `docs(openspec): add retirement tombstone to candle-degraded spec`，再
     `openspec archive retire-candle-degraded-verdict --skip-specs` + 提交（rename-only + tasks 勾选）
  4. mist-deploy：`chore(hil): retire dead candle verdict assertions`
- **push**：两仓 push（沿用既定流程，推送后观察 CI：mist docker.yml 双绿 + mist-deploy
  test-deploy-scripts 矩阵）。
- **收尾**：更新 `docs/openspec-gap-inventory.md`（归档记录 + spec 计数）与 AGENTS.md
  （活跃表去 6→5、归档行、archive 计数），随 mist 推送。

## §5 验证矩阵

| 门禁 | 命令 | 期望 |
|---|---|---|
| mist typecheck | `pnpm typecheck` | 0 错误 |
| 定向测试 | `npx jest apps/mist/src/realtime libs/config --forceExit` | 全绿 |
| 全量回归 | `pnpm test:ci` | 全绿 |
| 覆盖率 ratchet | `pnpm test:coverage` | ≥ 阈值（82.72/81.64/78.47/67.9） |
| 魔法值 | `pnpm check:magic` | count ≤ 基线 |
| lint | `pnpm lint:check` | 0 错误 |
| 残留 | 零残留 grep（§2.6） | 0 |
| 规格 | `openspec validate retire-candle-degraded-verdict --strict` + `--specs` | 全通过 |
| mist-deploy | `pwsh-preview` 跑测试脚本（条件） + push 后 CI | 全绿 |
| CI | 两仓 push 后 run 明细 | 双绿 |

## §6 待确认点

1. finalizer 签名收窄（`recordFinalizationFailure(recordLimitBreach = false)` + 8 调用点）——比
   仅删赋值行多一点改动，但符合干净退役；如倾向保守（保留参数）请指出（会被 noUnusedParameters 挡）。
2. candle-finalizer.spec 第二个测试整体删除（而非改写）——确认。
3. mist-deploy 的 `Get-CandleHealth` warn 桩 / `Wait-CandleCandidate` 空转问题只记录不修——确认。
