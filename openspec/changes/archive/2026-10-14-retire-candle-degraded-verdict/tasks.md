# Tasks: 退役 candle-degraded-event-recovery（降级收口）

## Phase 1: Live spec 退役（mist）

- [x] 1.1 `openspec/specs/candle-degraded-event-recovery/spec.md` Purpose 顶部加
  `> [!NOTE] RETIRED / DEPRECATED (2026-10-15 retire-candle-degraded-verdict)` 注记
  （格式沿用 chan-bsp 先例 `a1a99c8f`；requirements 保留不动）
- [x] 1.2 本 change delta `specs/candle-degraded-event-recovery/spec.md`：
  `## REMOVED Requirements` ×5（含 Reason + Migration）
- [x] 1.3 `openspec validate retire-candle-degraded-verdict --strict` 通过

## Phase 2: mist 死壳清理

- [x] 2.1 `realtime-candle-health.types.ts`：删 `RealtimeQuantityRejectionObservation` /
  `RealtimeCandleDegradedReason` / `RealtimeCandleHealthObservation` + 7 个 `*LastFailureAtMs`
  字段 + 失效 import
- [x] 2.2 `realtime-market-data-product.service.ts`：删 8 个私有 `*Ms` 字段、6 个写入点、
  `runtimeObservation()` 暴露行
- [x] 2.3 `candle-finalizer.ts`：删 `finalizationLastFailureAtMs`（类型/字段/写入/暴露）
- [x] 2.4 `validation.schema.ts` 删 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 声明与 import；
  `realtime-candle.config.ts` 删 `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS`
- [x] 2.5 更新 `candle-finalizer.spec.ts` 与 `realtime-market-data-product.service.spec.ts` 的
  `*Ms` 断言
- [x] 2.6 验证：`pnpm typecheck` + `npx jest apps/mist/src/realtime libs/config --forceExit` +
  零残留 grep（`RealtimeCandleHealthObservation|degradedReasons|DEGRADED_RECOVERY|LastFailureAtMs`）

## Phase 3: mist-deploy HIL 断言退役

- [x] 3.1 `scripts/run-realtime-candle-shadow-hil.ps1`：删 `Assert-CandleHealth`（零调用点）
- [x] 3.2 `scripts/test-realtime-candle-shadow-hil.ps1`：删对应 fixture 与断言簇（`:86-128` 区）
- [x] 3.3 本地验证：`pwsh-preview -File scripts/test-realtime-candle-shadow-hil.ps1`
  （不可用则语法解析 + push 后 `test-deploy-scripts.yml` 矩阵）

## Phase 4: 汇总与收尾

- [x] 4.1 `pnpm -C mist test:ci` + `check:magic` + `lint:check` 全绿
- [x] 4.2 `openspec validate` + 归档 `openspec archive retire-candle-degraded-verdict --skip-specs`
  + 人工核实 tombstone；两仓 push 后 CI 绿
- [x] 4.3 更新 `docs/openspec-gap-inventory.md` 与 AGENTS.md（归档记录、活跃表）
- [x] 4.4 勾选本 tasks 并记录落地结论
