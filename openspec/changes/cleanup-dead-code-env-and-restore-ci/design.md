# Design: 死代码与环境断线清理、公开仓 CI 恢复、茅台残留清除

## 1. 公开仓 CI 恢复（P0）

### 1.1 故障链认定（2026-10-13/14 取证）

```
push to master
  → docker.yml: validate job (lint/typecheck/test:ci/coverage/ci:contracts)
  → test:ci FAIL: libs/strategy/src/factor/external-plugin-loader.spec.ts
    "automatically discovers peer workspace mist-alpha-private plugins when present"
    expect(plugins.length).toBeGreaterThanOrEqual(3)   ← 公开 CI 返回 0
  → validate FAIL
  → build linux/amd64 被 skip（needs: validate）
  → 无新镜像 push 到 ghcr.io
```

- 本地通过/CI 失败的行为差异来自 loader 的候选路径解析（`external-plugin-loader.ts:135-155`）：
  `process.env.MIST_PRIVATE_PLUGINS_DIR` → `cwd/../mist-alpha-private` → `__dirname/../../../../mist-alpha-private`。
  本地工作区三路均可命中 `mist-alpha-private`（4 个插件），公开 CI 全部 miss。
- 受影响提交区间：`98207eed`(10-12) .. `3fafd26a`(10-13)，共 5 个失败 run。

### 1.2 修复设计（测试守卫）

`external-plugin-loader.spec.ts` 的该测试改为显式环境守卫：

```ts
it('discovers peer workspace plugins when the private workspace is present', () => {
  const peerDir = path.resolve(process.cwd(), '..', 'mist-alpha-private');
  const plugins = ExternalFactorPluginLoader.loadPlugins();

  if (!fs.existsSync(peerDir)) {
    // 单仓 checkout（公开 CI）：发现机制必须静默降级，公开套件不得失败。
    expect(plugins).toEqual([]);
    return;
  }

  // 多仓工作区：发现机制有效——断言结构而非私有清单，
  // 私有插件增删不得再导致公开仓测试变更。
  expect(plugins.length).toBeGreaterThanOrEqual(1);
  expect(plugins.every((p) => isFactorPlugin(p))).toBe(true);
  expect(new Set(plugins.map((p) => p.id)).size).toBe(plugins.length);
});
```

口径决策：
- **不再硬编码私有插件清单**（原断言 `plugin.regime.shanghai-index` / `plugin.private.alpha-momentum` 及 `>= 3`）。
  私有仓插件集已两次变动（删 `chan-custom-enhancer`、增 bull/bear left-right BSP），每次都被迫回头改公开仓测试
  （`dbdf41e8` 即为此类修补）——公开仓测试只验证**发现机制**，私有清单的正确性由私有仓自己的测试套件负责。
- **无私有仓分支断言 `toEqual([])`** 而非 skip：让公开 CI 实际覆盖「优雅降级」契约
  （`strategy-evaluation-contract`："Engine degrades gracefully when external plugins are absent"），
  不制造长期不被执行的测试。

### 1.3 验证

- 本地（有私有仓）：`npx jest libs/strategy/src/factor/external-plugin-loader.spec.ts` 全绿（走发现分支）。
- 半本地（模拟 CI）：临时 `MIST_PRIVATE_PLUGINS_DIR=/nonexistent` + 目录守卫下走降级分支——
  实现阶段用一次临时改名或 env 覆盖复核。
- 推 CI：确认 `Validate backend` + `Build linux/amd64` 均绿（镜像恢复构建）。

## 2. 死代码删除（A1–A9，逐项）

所有项均已执行全仓引用扫描（apps + libs + tools + mist-fe），零引用为删除依据；删除后跑
`pnpm -C mist typecheck` + 受影响模块 `jest` + 三大架构守卫。

| # | 位置 | 删除内容 | 连带修改 |
|---|------|---------|---------|
| A1 | `libs/signal/` | `runtime/chan-bsp-pipeline.ts` 整文件 | 删 `index.ts:53` 的 `toZhongshu` re-export 行 |
| A2 | `libs/strategy/src/decision-flow/` | `flow-blackboard.ts` 整文件 | 删 `decision-flow/index.ts:2` 导出；删 `decision-flow-evaluator.spec.ts` 的 `FlowBlackboard` describe 块 |
| A3 | `libs/strategy/src/strategy.constants.ts` | 6 个零引用导出（`:17/:42/:52/:65/:66/:67`） | 无（该文件其余导出保留） |
| A4 | `libs/chancore/src/internal/channel-lifecycle.ts` | `:943-944` 两行兼容别名 | 无（同块其他别名有消费，保留） |
| A5 | `libs/strategy/src/simulation/strategy-simulation.session.ts` | `:271-279` 两个方法 | 无 |
| A6 | `libs/config/src/validation.schema.ts` | `appEnvSchema` 整块（`:33-41`）；`mistEnvSchema` 内 `redis_server_host/port/db`（`:74-76`） | 无（`allowUnknown: true` 下移除声明不影响任何部署 env） |
| A7 | `libs/constants/src/market.constants.ts` | `MarketSourceType` / `CandleSessionType` 两个类型（`:11/:28`） | 无 |
| A8 | 模式联合收敛 | canonical：`RealtimeProductizationMode`（`libs/config/src/realtime-candle.config.ts:7`） | `realtime-candle-health.types.ts:17` 的 `RealtimeCandleProductMode` 改为对 canonical 的类型别名；`realtime-ingress.module.ts:105` 内联字面量替换为 canonical 类型；`validation.schema.ts:331` 的 `RealtimeStrategyMode` 语义不同（strategy 开关）保留但复用同一联合基底 |
| A9 | `libs/signal/src/runtime/realtime-kernel-pool.ts` | `KernelGroup.capacity` 字段（`:20/:139`） | 无（数据与 `kernel.windowBudget` 等价；`add-pre-market-strategy-hydration` 的容量幂等检查将基于 `windowBudget`） |

删除风险说明：
- A2 `FlowBlackboard` 为 `@app/strategy` 公共导出面成员，但全仓（含私有仓——私仓零代码 import）无消费者；
  git 历史可回溯。
- A6 中 `redis_server_*` 与部署 `mist-deploy` 的 `.env` 无引用（已核实），且 Joi `allowUnknown: true`，
  移除声明不会造成启动校验失败。
- A8 属治理规则「单一语义键名对齐」的落地（同一概念一个 canonical 类型），不改变任何运行时行为。

## 3. 环境变量接线

### 3.1 读而未声明 → 补声明

| 变量 | 读取点 | 归属 schema | 默认值（与代码默认一致） |
|------|--------|------------|------------------------|
| `REALTIME_RECONCILE_INTERVAL_MS` | `realtime-subscription-lifecycle.coordinator.ts:129` | `mistEnvSchema` | `60000` |
| `QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS` | `sources/qmt/realtime/realtime.client.ts:94` | `mistEnvSchema` | `10000` |
| `TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS` | `sources/tdx/realtime/realtime.client.ts:102` | `mistEnvSchema` | `10000` |
| `SIGNAL_HEALTH_URL` | `apps/schedule/src/pre-market-inspection.service.ts:395/442` | `scheduleEnvSchema` | `http://signal:8010/health` |
| `BACKEND_HEALTH_URL` | `apps/schedule/src/pre-market-inspection.service.ts:439` | `scheduleEnvSchema` | `http://mist-backend:8001/health` |

约束：Joi 声明默认值必须与代码 fallback 常量一致（`RECONCILE_INTERVAL_DEFAULT_MS=60_000`、
`DEFAULT_SUBSCRIPTION_CONTROL_TIMEOUT_MS=10000`、`PRE_MARKET_INSPECTION_CONFIG.DEFAULT_*`），
杜绝「schema 默认」与「代码默认」两处漂移。

### 3.2 声明而未消费 → 接线（TDX 心跳）

- 现状：`sources/tdx/realtime/realtime.client.ts:227` 心跳 `setInterval(..., 30_000)` 硬编码；
  schema 已声明 `TDX_WS_HEARTBEAT_INTERVAL_MS`（默认 30000）。
- 修复：构造器读取 `config.get<number>('TDX_WS_HEARTBEAT_INTERVAL_MS', DEFAULT_WS_HEARTBEAT_INTERVAL_MS)`，
  新增命名常量 `DEFAULT_WS_HEARTBEAT_INTERVAL_MS = 30_000`（`apps/mist/src/sources/constants.ts`，与
  `DEFAULT_WS_RECONNECT_DELAY_MS` 并列），心跳定时器使用该值。
- 依据：live spec `review-p2-backend-runtime-sweep`「TDX WebSocket timing is centralized」——
  "WHEN `TDX_WS_RECONNECT_DELAY_MS` and `TDX_WS_HEARTBEAT_INTERVAL_MS` are configured
  THEN TDX WebSocket scheduling MUST use the configured values"。
- QMT 客户端同样硬编码 `30_000`，但 QMT 无对应 env 声明、也无 spec 要求 → 本 change 不扩张公共配置面，
  仅补齐命名常量引用（不加新 env）。若后续需要对称配置另行立项。

## 4. 茅台残留清除

### 4.1 替换口径（沿用 shanghai-regime change 的既定口径）

| 原值 | 新值 |
|------|------|
| `600519` | `000001` |
| `600519.SH` / `600519.sh` / `SH600519` | `000001.SH` / `000001.sh` / `SH000001` |
| `贵州茅台` / `茅台` | `上证指数` |
| `maotai` / `Maotai` | 按上下文删除或改 `shanghai-index` |

安全性依据：`normalizeSecurityCode` 只做格式归一（不校验代码归属交易所），`000001` 为合法
SH 限定符号（上证指数 000001.SH），所有替换点均为示例/夹具数据或格式归一测试，无语义分支依赖
`600519` 的「沪市主板」含义（已抽查 `security-code.spec.ts` 等）。

### 4.2 mist 仓清单（26 文件 / 153 处 + 9 处中文）

- DTO/Controller 示例：`security/dto/init-security.dto.ts`、`security/dto/add-security-source.dto.ts`、
  `security/security-v1-alias.controller.ts`、`realtime-subscriptions/dto/initialize-realtime-subscription.dto.ts`、
  `visual/dto/query-visual-commands.dto.ts`；
- 测试数据：`collector/*.spec.ts`（3 文件）、`chan/chan-core.mapper.spec.ts`、
  `realtime-subscriptions/*.spec.ts`、`realtime/*.spec.ts`（4 文件）、`sources/*/*.spec.ts`、
  `strategy/*/*.spec.ts`、`libs/transport`、`libs/chancore`、`libs/utils`、`libs/strategy` 各 1-2 文件；
- 夹具：`apps/mist/src/realtime/fixtures/realtime-live-snapshot.fixtures.ts`。
- 不触碰：`openspec/changes/archive/**`（冻结历史）、`coverage/**`、`.data/**`（本地产物）。

### 4.3 mist-fe 仓清单（8 文件 / 89 处 + 12 处中文）

- `app/settings/realtime-subscriptions/page.tsx`、`app/strategies/StrategiesWorkspace.tsx`（占位符 "600519, 000001" → "000001"）、
  `app/dashboard/data/mock.ts`；
- 测试：`RealtimeSubscriptionsPage.test.tsx`、`StrategiesPage.test.tsx`、`realtime-subscriptions.test.ts`、`client.test.ts`；
- `__fixtures__/contracts/realtime-subscriptions/fixtures.json`（含 `securityCode`/`providerSymbol` 示例值）——
  测试注释约定 "refresh the pinned copy + digest together"，**替换后必须重算
  `fixtures.json.sha256`**（`shasum -a 256 fixtures.json`），并跑 mist-fe 全量测试确认契约测试通过。

风险与边界：本次只改 fixtures 中「示例证券代码」字段值，不改字段/enum/可空性/错误码结构，
不属于契约变更；若实现中发现任何断言依赖 `600519` 的交易所语义，改用上下文等价的合法代码并记录。

### 4.4 验证

- mist：`grep -rn "600519\|茅台" apps libs tools --include=*.ts` 期望 0 结果（排除 archive/产物目录）；
- mist-fe：同口径 grep 为 0；`pnpm -C mist-fe test`、`typecheck`、`lint` 全绿；
- mist：`pnpm -C mist test:ci` 全绿（替换涉及 20+ 测试文件，必须全量回归）。

## 5. 断线核查记录（本 change 之外，供上下文）

- **E1 悬案澄清**：`dbdf41e8`（10-13 16:58）为并行会话所做的 loader 测试期望对齐（伴随私仓删
  `chan-custom-enhancer`），时间线吻合，无需行动。
- **E2 归档-现实不一致（记录不处理）**：归档 change §4 记录左右侧 BSP「暂缓实现」，私仓 10-13/14 已实现
  bull/bear 插件并导出 4 插件——归档为历史快照不改；本 change 的 CI 修复（2.1 节）已使公开仓对该私仓演进取守
  中立（不再硬编码清单）。
- **新发现：candle degraded verdict 判定链缺失（单独立项）**：`candle-degraded-event-recovery`（08-07 归档）
  声称的 windowed degraded verdict 在 08-09 OTel 迁移（`a6ce18e5`）中随
  `RealtimeCandleHealthService`/`RealtimeMarketObservabilityService` 一并删除；live spec 08-21 批量归档时未同步更新，
  造成 spec-实现脱钩：`RealtimeCandleHealthObservation`/`degradedReasons` 零消费、
  `REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_MS` 零读取、`mist_realtime_candle_health` 指标缺位。
  需单独立项决策「在 OO/OTel 范式下恢复判定」或「down-grade live spec」，本 change 只记录。
- **AGENTS.md 过期项**：workspace 根 `AGENTS.md` 的活跃 change 表（shanghai-regime 0/18、hydration 0/17 等）
  与实际状态不符——该文件不在 git 仓内，由用户自行维护，此处仅提示。

## 6. 验收命令

```bash
# Phase 1（CI）
cd mist && npx jest libs/strategy/src/factor/external-plugin-loader.spec.ts

# Phase 2-3（死代码 + env）
pnpm -C mist typecheck
pnpm -C mist test libs/strategy/src/dev-server-boundary.guard.spec.ts \
  libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts \
  libs/strategy/src/strategy-dual-timestamp.guard.spec.ts
pnpm -C mist test:ci

# Phase 4（残留）
grep -rn "600519\|茅台" mist/apps mist/libs mist/tools --include=*.ts | grep -v archive
grep -rn "600519\|茅台" mist-fe/app mist-fe/lib mist-fe/utils mist-fe/__fixtures__

# 汇总
pnpm -C mist test:coverage
openspec validate cleanup-dead-code-env-and-restore-ci --strict
```
