# Tasks: 死代码与环境断线清理、公开仓 CI 恢复、茅台残留清除

## Phase 1: 公开仓 CI 恢复（P0，先行落地）

> 1.1–1.3 已由并行提交 `0aae2c3a`（2026-10-14）落地：守卫形态与 design §1.2 一致
> （存在性守卫 + 不硬编码私仓清单 + 缺失时 `toEqual([])`）；CI run `38581721274`（`7d3dbc44`）
> `Validate backend` + `Build linux/amd64` 双绿佐证。本次落地仅复核。

- [x] 1.1 `libs/strategy/src/factor/external-plugin-loader.spec.ts` 的
  "automatically discovers peer workspace external-plugins plugins when present" 测试改为
  私有仓目录存在性守卫（存在 → 断言发现机制有效且不硬编码私有清单；不存在 → 断言 `toEqual([])` 优雅降级）
- [x] 1.2 本地验证：`npx jest libs/strategy/src/factor/external-plugin-loader.spec.ts` 全绿；
  用 `MIST_PRIVATE_PLUGINS_DIR=/nonexistent` 或临时目录改名复核降级分支
- [x] 1.3 push 后观察 CI：确认 `Validate backend` 与 `Build linux/amd64` 均绿，镜像恢复构建
  （`gh run watch` 不可信 exit code 的教训照旧：查 `gh run view <run> --json conclusion` + job 明细）

## Phase 2: 死代码删除（A1–A9）

- [x] 2.1 A1 删除 `libs/signal/src/runtime/chan-bsp-pipeline.ts` 整文件 +
  `libs/signal/src/index.ts:53` 的 `toZhongshu` re-export 行
- [x] 2.2 A2 删除 `libs/strategy/src/decision-flow/flow-blackboard.ts` 整文件 +
  `decision-flow/index.ts:2` 导出行 + `decision-flow-evaluator.spec.ts` 内 `FlowBlackboard` describe 块
- [x] 2.3 A3 删除 `libs/strategy/src/strategy.constants.ts` 6 个零引用导出
  （`MACRO_TREND_DIRECTIONS`、`HIGHER_PERIOD_RATIOS`、`MACD_MIN_CALCULATION_BARS`、
  `STRATEGY_DEFAULT_PERIODS`、`DEFAULT_PREWARM_BARS`、`DEFAULT_SIMULATION_SPEED`）
- [x] 2.4 A4 删除 `libs/chancore/src/internal/channel-lifecycle.ts:943-944` 两个兼容别名
- [x] 2.5 A5 删除 `libs/strategy/src/simulation/strategy-simulation.session.ts`
  的 `getAllSignals()` / `getGeneratedFrames()`
- [x] 2.6 A6 删除 `libs/config/src/validation.schema.ts` 的 `appEnvSchema` 整块
  （含 `nest_server_port`、`redis_server_*`）与 `mistEnvSchema` 内 `redis_server_host/port/db` 声明
- [x] 2.7 A7 删除 `libs/constants/src/market.constants.ts` 的
  `MarketSourceType` / `CandleSessionType` 类型
- [x] 2.8 A8 模式联合收敛：`realtime-candle-health.types.ts` 的 `RealtimeCandleProductMode` 改为
  `RealtimeProductizationMode` 别名；`realtime-ingress.module.ts:105` 内联字面量替换为 canonical 类型；
  `validation.schema.ts` 的 `RealtimeStrategyMode` 复用同一联合基底
- [x] 2.9 A9 删除 `libs/signal/src/runtime/realtime-kernel-pool.ts` 的 `KernelGroup.capacity`
  字段与赋值（消费方改用 `kernel.windowBudget`，本 change 无消费方，仅删除）
- [x] 2.10 删除后验证：`pnpm -C mist typecheck` + 受影响模块 jest + 三大架构守卫全绿

## Phase 3: 环境变量接线（B）

- [x] 3.1 `mistEnvSchema` 补声明：`REALTIME_RECONCILE_INTERVAL_MS`（default 60000）、
  `QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS` / `TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS`（default 10000），
  默认值与代码 fallback 常量一致
- [x] 3.2 `scheduleEnvSchema` 补声明：`SIGNAL_HEALTH_URL`（default `http://signal:8010/health`）、
  `BACKEND_HEALTH_URL`（default `http://mist-backend:8001/health`）
- [x] 3.3 TDX 心跳接线：`apps/mist/src/sources/constants.ts` 新增
  `DEFAULT_WS_HEARTBEAT_INTERVAL_MS = 30_000`；`sources/tdx/realtime/realtime.client.ts`
  读取 `TDX_WS_HEARTBEAT_INTERVAL_MS` 并用于心跳 `setInterval`（消除硬编码 `30_000`）
- [x] 3.4 验证：相关模块 jest（coordinator / tdx client / pre-market-inspection / config schema）；
  确认无新增 magic-literal 违规（`pnpm -C mist check:magic`）

## Phase 4: 茅台残留清除

- [x] 4.1 mist 仓替换：`600519`→`000001`、`600519.SH`→`000001.SH`、`贵州茅台`→`上证指数`
  （26 文件 / 153 处 + 9 处中文；排除 `openspec/changes/archive/**`、`coverage/**`、`.data/**`、`node_modules`）
- [x] 4.2 mist-fe 仓替换：同上口径（8 文件 / 89 处 + 12 处中文）；
  `__fixtures__/contracts/realtime-subscriptions/fixtures.json` 替换后重算
  `fixtures.json.sha256`（`shasum -a 256`）
- [x] 4.3 残留验证：两仓 grep `600519\|茅台\|maotai` 期望 0 结果（约定排除目录除外）
- [x] 4.4 回归：`pnpm -C mist test:ci` 全绿 + `pnpm -C mist-fe test` 全绿 +
  `pnpm -C mist-fe typecheck` / `lint` 全绿

## Phase 5: 汇总验证与收尾

- [x] 5.1 `pnpm -C mist test:coverage`（coverage ratchet：lines ≥ 82.72% / statements ≥ 81.64%）
- [x] 5.2 `pnpm -C mist lint:check` + `pnpm -C mist typecheck`
- [x] 5.3 `openspec validate cleanup-dead-code-env-and-restore-ci --strict`
- [x] 5.4 记录核查结论（proposal §1-4 与 design §5 的断线清单在本 change 落地后归档归档；
  candle degraded verdict 缺失另立 change、AGENTS.md 过期项提示用户）
