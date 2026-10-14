# Proposal: 死代码与环境断线清理、公开仓 CI 恢复、茅台残留清除

## Why

2026-10-13/14 对 mist 主仓做「断线」审计（死代码 / 环境变量 / 跨仓接缝），确认四组问题；其中公开仓 CI 已实际中断，Docker 镜像构建被阻断：

### 1. 公开仓 CI 全红（P0，正在阻断镜像构建）

`Build Docker Images` workflow 自 2026-10-12 起连续失败（运行 38268699489 / 38271123339 / 38433259999 / 38434853196 / 38435291784）。失败点恒定为
`libs/strategy/src/factor/external-plugin-loader.spec.ts:212` 的
"automatically discovers peer workspace mist-alpha-private plugins when present" 测试：

- 它无条件断言 `plugins.length >= 3` 并检查具体私有插件 ID，**硬依赖本地多仓工作区的 `../mist-alpha-private` 私有仓**；
- 公开仓 CI 只 checkout 单仓，该目录不存在 → `loadPlugins()` 返回空数组 → 断言必失败；
- validate job 失败 → `build linux/amd64` job 被 skip → **自 10-12 起无新 backend 镜像被构建/推送**（部署链路受直接影响）。

该测试与外部插件/上证插件工作同批引入，是「公开仓测试与私有仓耦合」的典型断线，且与
`strategy-evaluation-contract` 现行场景 "Engine degrades gracefully when external plugins are absent"
（public test suites and builds MUST pass cleanly without external dependencies）直接冲突——测试违反了本 repo 的既有契约。

（注：2026-10-04 的另一次 CI 失败为 `ci:contracts` 的 `channel.ts` 检查，已在后续提交修复，本地复跑 `node tools/test-ci-contracts.mjs` 通过；本 change 不重复处理。）

### 2. 死代码残留（9 处，全仓零引用）

统一内核重构（unify-strategy-evaluation-pipeline）与 chan_bsp 退役后的遗留，均已用全仓引用扫描验证（apps/libs/tools/mist-fe 全查）：

| # | 位置 | 形态 |
|---|------|------|
| A1 | `libs/signal/src/runtime/chan-bsp-pipeline.ts` + `libs/signal/src/index.ts:53` | `toZhongshu` 薄包装整文件，再导出后零消费（调用方全部直连 `ChanCore.toZhongshu`） |
| A2 | `libs/strategy/src/decision-flow/flow-blackboard.ts` | `FlowBlackboard` 类零生产消费（评估器实际使用 `context.attributes`），仅被自带 spec 引用 |
| A3 | `libs/strategy/src/strategy.constants.ts:17/42/52/65/66/67` | 6 个零引用导出（`MACRO_TREND_DIRECTIONS`、`HIGHER_PERIOD_RATIOS`、`MACD_MIN_CALCULATION_BARS`、`STRATEGY_DEFAULT_PERIODS`、`DEFAULT_PREWARM_BARS`、`DEFAULT_SIMULATION_SPEED`） |
| A4 | `libs/chancore/src/internal/channel-lifecycle.ts:943-944` | `BI_CENTRAL_CORE_LENGTH` / `BI_CENTRAL_MIN_SEALED_LENGTH` 向后兼容别名，零引用 |
| A5 | `libs/strategy/src/simulation/strategy-simulation.session.ts:271/275` | `getAllSignals()` / `getGeneratedFrames()` 零调用（dump 走 `dumpCurrentState()`） |
| A6 | `libs/config/src/validation.schema.ts:33-41/74-76` | 死 schema `appEnvSchema`（含 `nest_server_port`、`redis_server_*`）与 `mistEnvSchema` 内零读取的 `redis_server_*` 声明 |
| A7 | `libs/constants/src/market.constants.ts:11/28` | `MarketSourceType` / `CandleSessionType` 类型零引用（同文件其余导出均有消费） |
| A8 | `libs/config/src/realtime-candle.config.ts:7` 等 4 处 | `'off'\|'shadow'\|'on'` 联合四份重复定义（canonical 类型零引用 + 两处 app 内重复 + 一处内联字面量） |
| A9 | `libs/signal/src/runtime/realtime-kernel-pool.ts:20/139` | `KernelGroup.capacity` 只写不读（`kernel.windowBudget` 已含同一数据） |

### 3. 环境变量双向断线

- **读而未声明（5 个）**：`REALTIME_RECONCILE_INTERVAL_MS`（coordinator:129）、`QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS` / `TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS`（tdx/qmt realtime clients）、`SIGNAL_HEALTH_URL` / `BACKEND_HEALTH_URL`（schedule 盘前巡检）——靠代码默认值静默工作，schema 无校验、部署面不可见；
- **声明而未消费（1 个）**：`TDX_WS_HEARTBEAT_INTERVAL_MS`——live spec `review-p2-backend-runtime-sweep`
  「TDX WebSocket timing is centralized」明确要求 *configured 时 MUST use the configured values*，
  但 TDX 客户端把心跳硬编码为 `30_000`，config 声明与实现脱钩（spec 违规）。

### 4. shanghai-regime change 的茅台残留清除未完成

已归档 change `add-shanghai-regime-and-left-right-bsp-plugins` 任务 §1.4/§5.4 声称「清理全仓测试、注释与配置中的 600519 与『茅台』字样」「全仓无任何茅台残留」，实际残留：

- mist 仓：153 处 `600519`（26 文件）+ 9 处「贵州茅台」（realtime-subscriptions DTO/服务，测试数据与 Swagger 示例）；
- mist-fe 仓：89 处 `600519`（8 文件，含带 sha256 的契约 fixtures.json）+ 12 处「茅台/maotai」。

## What Changes

1. **恢复公开仓 CI（先行）**：`external-plugin-loader.spec.ts` 的 peer workspace 发现测试改为**按私有仓目录存在性守卫**——目录存在时断言发现机制有效（不再硬编码私有插件清单，避免每次私仓插件增删都要改公开仓测试）；目录不存在时（公开 CI/单仓环境）断言 `loadPlugins()` 静默返回空数组。恢复 `Build Docker Images` 全绿与镜像构建。
2. **死代码删除（A1–A9）**：按上表逐项删除；每项删除附引用扫描证据，删除后跑类型检查与受影响模块测试。
3. **环境变量接线（B）**：5 个读而未声明变量补进所属 app 的 Joi schema（默认值与代码默认一致）；`TDX_WS_HEARTBEAT_INTERVAL_MS` 在 TDX 客户端接线消费（默认 30000ms），消除硬编码。
4. **茅台残留清除**：按既定口径（`600519`→`000001`、`600519.SH`→`000001.SH`、`贵州茅台`→`上证指数`）清除 mist 与 mist-fe 全部残留；mist-fe `fixtures.json` 重签 sha256。

## Capabilities

### Modified Capabilities

- `strategy-evaluation-contract`：`Strategy Engine Shall Support Dynamic External Factor Plugins`
  的环境守卫细化——公开测试套件不得硬依赖私有仓存在性、不得硬编码私有插件清单；
  私有仓缺失时发现机制必须静默降级且公开套件通过。

（死代码删除、schema 补声明、残留替换均为实现面对既有契约的对齐，不引入新 capability。）

## Impact & Non-Goals

- **Impact**：
  - CI/发布链路：`docs(docker.yml) validate → build → ghcr push` 恢复（外部插件测试守卫修复）。
  - `libs/signal`、`libs/strategy`、`libs/chancore`、`libs/config`、`libs/constants`、`apps/mist`：死代码与声明收窄；
  - `apps/mist` / `apps/schedule`：env schema 补全 + TDX 心跳接线；
  - `mist` + `mist-fe` 两仓：测试数据/DTO 示例残留替换；mist-fe `fixtures.json` + `.sha256` 同步。
- **Non-Goals**：
  - 不恢复 `candle-degraded-event-recovery` 的 windowed degraded verdict 判定链（2026-08-09 OTel 迁移删除了
    `RealtimeCandleHealthService` 等实现，live spec 未同步更新、判定与 `mist_realtime_candle_health` 指标导出缺位；
    属独立功能缺失，需单独立项决策"恢复 vs 降级 spec"，本 change 只记录不处理）；
  - 不改 prewarm 家族诊断字段消费（已归 `upgrade-backtest-decision-and-parity-engine` Phase 0）；
  - 不重构外部插件加载器架构（仅修测试守卫与断言口径）；
  - 不触碰 `test/fixtures/realtime/` 跨仓契约资产与 archived change 内的冻结契约副本。
