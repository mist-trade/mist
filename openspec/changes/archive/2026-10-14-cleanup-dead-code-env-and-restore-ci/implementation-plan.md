# Implementation Plan: cleanup-dead-code-env-and-restore-ci

> 三步工作流第 2 步产物（spec 四件套已确认，commit `978dd02d`）。本计划为代码级落地细节，
> 确认后进入第 3 步（worktree 落地）。
> 落地仓库：**mist**（Phase 1–3、5 + 残留 mist 侧）与 **mist-fe**（残留前端侧）。
>
> **重要现状（2026-10-15 取证）**：Phase 1（公开仓 CI 恢复）已由并行提交 `0aae2c3a`（10-14 16:54）落地，
> 守卫形态与 design §1.2 完全一致；此后 CI 双绿（最新 run `38581721274`：
> `Validate backend` ✅ + `Build linux/amd64` ✅，非 skip）。本计划将 Phase 1 缩为「复核 + 勾选任务」。

约定：以下行号为 HEAD `978dd02d` 行号，仅定位用；落地编辑一律按**内容匹配**，同一文件多处改动合并处理。

---

## §0 取证基线（HEAD 978dd02d）

| 项 | 结论 |
|----|------|
| A1–A9 零引用 | 全部在 HEAD 复验为 0（扫描面 apps/libs/tools + mist-fe + 私有仓抽查） |
| B 读取点 | `REALTIME_RECONCILE_INTERVAL_MS`（coordinator:129，fallback 60_000）、`TDX/QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS`（两份 realtime.client，fallback 10_000）、`SIGNAL/BACKEND_HEALTH_URL`（schedule 盘前巡检，fallback 已定义）；schema 均未声明 |
| TDX 心跳 | `realtime.client.ts:227-231` `setInterval(..., 30_000)` 硬编码；schema 已声明 `TDX_WS_HEARTBEAT_INTERVAL_MS`（默认 30000）→ spec 违规接线 |
| 残留 | mist：27 文件 / 154 行级命中（含 `libs/realtime/README.md` 1 处 Redis key 示例）+ 9 处「贵州茅台」；mist-fe：9 文件 / ~101 行级命中（8 个含 600519 + `DashboardView.test.tsx` 仅中文） |
| 摘要锚点 | mist-fe `__fixtures__/contracts/realtime-subscriptions/fixtures.json.sha256` 现为 `ceb7de53…`，由 `__tests__/contract-digest.test.ts` 逐字节校验（单边编辑必挂，替换后必须同步重签） |
| magic 门禁 | `validation.schema.ts` / `*.config.ts` / `*.spec.ts` 均豁免；tdx/qmt client 的 `30_000` 在基线内 → 删除只降计数；新增 Joi 默认值不引入新违规 |

---

## §1 Phase 1：CI 修复复核（tasks 1.1–1.3，已落地）

证据链：
- 守卫实现：`git show 0aae2c3a -- libs/strategy/src/factor/external-plugin-loader.spec.ts`
  （目录存在性守卫 + 无私有清单硬编码 + 缺失时 `toEqual([])`）。
- CI：`gh run view 38581721274 --json jobs` → `Validate backend` / `Build linux/amd64` 双 success。

落地动作：
1. 复核跑一次：`npx jest libs/strategy/src/factor/external-plugin-loader.spec.ts`（本机有私有仓 → 走发现分支）。
2. 降级分支已由公开 CI 实跑覆盖（单仓 checkout → 空数组断言），无需本地模拟。
3. tasks.md 勾选 1.1–1.3，注释「已由 0aae2c3a 落地 + run 38581721274 双绿」。

---

## §2 Phase 2：死代码删除（A1–A9）

### 2.1 A1 — chan-bsp-pipeline 薄包装
- 删除整文件：`rm /Users/moyui/sean/mist/mist/libs/signal/src/runtime/chan-bsp-pipeline.ts`
- `libs/signal/src/index.ts`：删 `:53` `export { toZhongshu } from './runtime/chan-bsp-pipeline';`
- 验证：`grep -rn "chan-bsp-pipeline" apps libs tools` = 0
- 风险：低（`toZhongshu` 全仓调用方均直连 `ChanCore.toZhongshu`）

### 2.2 A2 — FlowBlackboard
- 删除整文件：`rm /Users/moyui/sean/mist/mist/libs/strategy/src/decision-flow/flow-blackboard.ts`
- `libs/strategy/src/decision-flow/index.ts`：删 `:2` `export * from './flow-blackboard';`
- `libs/strategy/src/decision-flow/decision-flow-evaluator.spec.ts`：
  删 `:6` import 行 + `:61-80` `describe('FlowBlackboard', …)` 整块
- 验证：`grep -rn "FlowBlackboard" apps libs tools mist-fe ../external-plugins` = 0；
  `npx jest libs/strategy/src/decision-flow`
- 风险：中低（曾为 `@app/strategy` 公开导出面；主仓/私仓零消费，git 历史可回溯）

### 2.3 A3 — strategy.constants.ts 六个死导出
删除（当前行区间）：`MACRO_TREND_DIRECTIONS (:17-21)`、`HIGHER_PERIOD_RATIOS (:42-50)`、
`MACD_MIN_CALCULATION_BARS (:52)`、`STRATEGY_DEFAULT_PERIODS (:65)`、`DEFAULT_PREWARM_BARS (:66)`、
`DEFAULT_SIMULATION_SPEED (:67)`。保留其余全部导出（`DECISION_ACTIONS`、`SIGNAL_KINDS`、
`CANDIDATE_BSP_TYPES`、`CHAN_BSP_*`、`DEFAULT_REQUIRED_BARS_*`、`BSP_CONFIDENCE`、
`DEFAULT_TECHNICAL_FACTOR_CONFIDENCE`）。
- 验证：六个名字 grep = 0；`npx jest libs/strategy`
- 风险：低（`libs/strategy/src/index.ts:89` 为 `export *`，导出面自动收窄）

### 2.4 A4 — chancore 兼容别名
`libs/chancore/src/internal/channel-lifecycle.ts`：删 `:943-944`
（`BI_CENTRAL_CORE_LENGTH` / `BI_CENTRAL_MIN_SEALED_LENGTH`）；同块 `Bi*` 别名保留。
- 验证：两个名字 grep = 0；`npx jest libs/chancore`
- 风险：低

### 2.5 A5 — 推演会话两个零调用方法
`libs/strategy/src/simulation/strategy-simulation.session.ts`：删 `:271-279`
（`getAllSignals()` / `getGeneratedFrames()`，含中间空行）。
- `accumulatedSignals` 字段**保留**（`:214` `dumpCurrentState` 使用）。
- 验证：两个方法名 grep = 0（含 spec）；`npx jest libs/strategy/src/simulation`
- 风险：低

### 2.6 A6 — 死 schema 收窄
`libs/config/src/validation.schema.ts`：
- 删 `appEnvSchema` 整块（注释 `:30-32` + `:33-39`，含 `nest_server_port` / `redis_server_*`）；
- 删 `mistEnvSchema` 内 `redis_server_host/port/db`（`:74-76`）。
- `commonEnvSchema` 的 mysql 键不动。
- 验证：`grep -rn "appEnvSchema\|nest_server_port\|redis_server_" apps libs tools` = 0；
  `npx jest libs/config`；`pnpm typecheck`；启动校验不受影响（零读取 + mist-deploy 未设 + `allowUnknown`）
- 风险：低-中（公开配置面收窄，必要时空可从 git 恢复）

### 2.7 A7 — 两个零引用类型
`libs/constants/src/market.constants.ts`：删 `:11-13`（`MarketSourceType`）与 `:28-30`（`CandleSessionType`）含空行；
其余导出保留（`MARKET_SOURCES` 等有消费）。
- 验证：两个名字 grep = 0
- 风险：低

### 2.8 A8 — 模式联合收敛（单一定义）
- `apps/mist/src/realtime/candle/realtime-candle-health.types.ts`：
  新增 `import type { RealtimeProductizationMode } from '@app/config';`
  `:17` → `export type RealtimeCandleProductMode = RealtimeProductizationMode;`
- `apps/mist/src/realtime/realtime-ingress.module.ts`：
  `:15` import 增 `type RealtimeStrategyMode`；`:105` 形参改 `mode: RealtimeStrategyMode`
  （函数实收 `resolveRealtimeStrategyMode()` 的返回，语义用 StrategyMode 最准；该类型下面第 3 条即 canonical 别名）
- `libs/config/src/validation.schema.ts`：`:2-7` import 增 `type RealtimeProductizationMode`；
  `:331` → `export type RealtimeStrategyMode = RealtimeProductizationMode;`
  （保留类型名与语义，值域复用同一联合基底；`resolveRealtimeStrategyMode` 函数体不动）
- `apps/mist/src/health/health.vo.ts`（2026-10-15 复验补入，用户已确认）：
  import 增 `type { RealtimeProductizationMode, RealtimeStrategyMode } from '@app/config'`；
  `:18` → `productizationMode!: RealtimeProductizationMode;`，
  `:21` → `strategyMode!: RealtimeStrategyMode;`
  （`@ApiProperty` 的 `enum` 字面量不动；`health.controller.ts` 手写归一化不动——其语义是软降级而非本收敛面）
- 验证：`pnpm typecheck`；`npx jest apps/mist/src/realtime apps/mist/src/health libs/config`
- 风险：低-中（纯类型层，零运行时变化）

### 2.9 A9 — KernelGroup.capacity（只写不读）
`libs/signal/src/runtime/realtime-kernel-pool.ts`：删 `:20` 字段与 `:139` 赋值。
- `assertCapacity(requiredBars)`（`:112` 调用、`:203` 定义）**保留**——校验的是局部 `requiredBars`，
  与字段无关；窗口预算由 `kernel.windowBudget` 承载
  （`add-pre-market-strategy-hydration` 未来落地按 planSignature + windowBudget 判定幂等）。
- 验证：该文件 `grep -n "capacity"` 只剩 `assertCapacity` 相关；`npx jest libs/signal`
- 风险：低

### 2.10 Phase 2 批次验证
```bash
cd mist           # 或 worktree
npx jest libs/strategy libs/signal libs/chancore libs/config libs/constants --watchman=false
npx jest libs/strategy/src/dev-server-boundary.guard.spec.ts \
         libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts \
         libs/strategy/src/strategy-dual-timestamp.guard.spec.ts \
         libs/signal/src/signal-boundary.guard.spec.ts \
         libs/chancore/src/chancore-boundary.guard.spec.ts
pnpm typecheck
```

---

## §3 Phase 3：环境变量接线（B）

### 3.1 mistEnvSchema 补三个声明（validation.schema.ts）
插入点与内容（默认值与代码 fallback 严格一致）：

- `TDX_WS_HEARTBEAT_INTERVAL_MS` 块（`:103-107`）之后：
```ts
TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS: Joi.number()
  .integer()
  .positive()
  .default(10_000)
  .description('TDX subscription control request timeout in milliseconds'),
```
- `QMT_WS_RECONNECT_DELAY_MS` 块（`:127-131`）之后：
```ts
QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS: Joi.number()
  .integer()
  .positive()
  .default(10_000)
  .description('QMT subscription control request timeout in milliseconds'),
```
- `REALTIME_STRATEGY_JOB_TIMEOUT_MS` 块（`:164-168`）之后：
```ts
REALTIME_RECONCILE_INTERVAL_MS: Joi.number()
  .integer()
  .positive()
  .default(60_000)
  .description('Realtime subscription reconciliation interval in milliseconds'),
```

对齐锚点：`DEFAULT_SUBSCRIPTION_CONTROL_TIMEOUT_MS = 10000`（`apps/mist/src/sources/constants.ts:3`）、
`RECONCILE_INTERVAL_DEFAULT_MS = 60_000`（coordinator `:43`）。

### 3.2 scheduleEnvSchema 补两个声明
`:244-250` 块内追加（与 `pre-market-inspection.constants.ts:9-10` 一致）：
```ts
SIGNAL_HEALTH_URL: Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .default('http://signal:8010/health'),
BACKEND_HEALTH_URL: Joi.string()
  .uri({ scheme: ['http', 'https'] })
  .default('http://mist-backend:8001/health'),
```

### 3.3 TDX 心跳接线（消除硬编码 30_000）
- `apps/mist/src/sources/constants.ts`：`DEFAULT_WS_RECONNECT_DELAY_MS` 后加
  `export const DEFAULT_WS_HEARTBEAT_INTERVAL_MS = 30_000;`
- `apps/mist/src/sources/tdx/realtime/realtime.client.ts`：
  - 字段区（`:72` `controlTimeoutMs` 后）加 `private readonly heartbeatIntervalMs: number;`
  - 构造器（`:104` 后）：
    `this.heartbeatIntervalMs = config.get<number>('TDX_WS_HEARTBEAT_INTERVAL_MS', DEFAULT_WS_HEARTBEAT_INTERVAL_MS);`
  - `:231` `}, 30_000);` → `}, this.heartbeatIntervalMs);`
  - `'../../constants'` import 块增 `DEFAULT_WS_HEARTBEAT_INTERVAL_MS`
- 依据：live spec `review-p2-backend-runtime-sweep`「TDX WebSocket timing is centralized」。

### 3.4 QMT 心跳（design 决策：不加新 env）
`apps/mist/src/sources/qmt/realtime/realtime.client.ts:223` `30_000` → `DEFAULT_WS_HEARTBEAT_INTERVAL_MS`
（import 同款追加）。行为不变，仅命名化。

### 3.5 测试用例
- `libs/config/src/validation.schema.spec.ts`（import 增 `scheduleEnvSchema`）新增：
```ts
describe('env wiring defaults (cleanup-dead-code-env-and-restore-ci)', () => {
  it('defaults subscription control timeouts and reconcile interval to code fallbacks', () => {
    const { error, value } = mistEnvSchema.validate(baseEnv);
    expect(error).toBeUndefined();
    expect(value.REALTIME_RECONCILE_INTERVAL_MS).toBe(60_000);
    expect(value.TDX_SUBSCRIPTION_CONTROL_TIMEOUT_MS).toBe(10_000);
    expect(value.QMT_SUBSCRIPTION_CONTROL_TIMEOUT_MS).toBe(10_000);
  });

  it('defaults pre-market inspection health endpoints', () => {
    const { error, value } = scheduleEnvSchema.validate(baseEnv);
    expect(error).toBeUndefined();
    expect(value.SIGNAL_HEALTH_URL).toBe('http://signal:8010/health');
    expect(value.BACKEND_HEALTH_URL).toBe('http://mist-backend:8001/health');
  });
});
```
- `apps/mist/src/sources/tdx/realtime/realtime.client.spec.ts`：
  - `createClient(values: Record<string, unknown> = {})`：config mock 改
    `get: (key: string, fallback?: unknown) => values[key] ?? fallback`
    （与 ConfigService 二参语义一致，既有用例不受影响）
  - 新增断言（2 条）：无配置 → `setInterval` 以 `30_000` 调用；配置
    `{ TDX_WS_HEARTBEAT_INTERVAL_MS: 12_345 }` → 以 `12_345` 调用
    （`jest.spyOn(global, 'setInterval')`，emit `open` 后断言；若与 fake timers 冲突则在用例内先 spy 再 emit）
- QMT 仅常量替换，不新增测试（既有 client spec 回归覆盖）。

### 3.6 验证
```bash
npx jest libs/config/src/validation.schema.spec.ts \
         apps/mist/src/sources/tdx/realtime/realtime.client.spec.ts \
         apps/mist/src/sources/qmt/realtime/realtime.client.spec.ts \
         apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.spec.ts \
         apps/schedule/src/pre-market-inspection.service.spec.ts
pnpm typecheck && pnpm check:magic
```
（`check:magic` 预期：client 硬编码删除 → count 下降；schema/常量文件豁免 → 通过）

---

## §4 Phase 4：茅台残留清除

### 4.1 口径与顺序
| 原值 | 新值 |
|------|------|
| `600519` | `000001`（`600519.SH`→`000001.SH`、`SH600519`→`SH000001` 子串替换自然覆盖） |
| `贵州茅台` / `茅台` | `上证指数` |
| `maotai` | 两仓均无现存命中（复验过），不需处理 |

顺序：**先特例后全局 sweep**。特例：`mist-fe/app/strategies/StrategiesWorkspace.tsx`
`"600519, 000001"`（`:68` useState 初值、`:366` placeholder）→ `"000001"`，
避免扫成 `"000001, 000001"`。

### 4.2 mist 仓（27 文件 / 154 行级命中，风险：低）
```bash
cd /Users/moyui/sean/mist/mist
grep -rn "600519\|贵州茅台" apps libs tools | wc -l   # 干跑：期望 154
FILES=$(grep -rl "600519\|贵州茅台" apps libs tools)
perl -pi -e 's/贵州茅台/上证指数/g; s/茅台/上证指数/g; s/600519/000001/g' $FILES
grep -rn "600519\|贵州茅台\|茅台\|maotai" apps libs tools | wc -l   # 期望 0
```
文件清单（行级命中数）：
```
 3 apps/mist/src/chan/chan-core.mapper.spec.ts
 1 apps/mist/src/security/dto/init-security.dto.ts
 3 apps/mist/src/security/dto/add-security-source.dto.ts
 4 apps/mist/src/security/security-v1-alias.controller.ts
 8 apps/mist/src/collector/post-close-sync.service.spec.ts
 2 apps/mist/src/collector/strategies/qmt-collection.strategy.spec.ts
 4 apps/mist/src/collector/collector.service.spec.ts
 2 apps/mist/src/collector/collector-http-boundary.integration.spec.ts
 4 apps/mist/src/realtime-subscriptions/dto/initialize-realtime-subscription.dto.ts
 8 apps/mist/src/realtime-subscriptions/dto/initialize-realtime-subscription.dto.spec.ts
12 apps/mist/src/realtime-subscriptions/realtime-subscription.service.spec.ts
 3 apps/mist/src/realtime/realtime-ingress.contract.spec.ts
 1 apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts
 8 apps/mist/src/realtime/hil/realtime-subscription-hil.spec.ts
 1 apps/mist/src/realtime/fixtures/realtime-live-snapshot.fixtures.ts
 6 apps/mist/src/realtime/realtime-security-allowlist.service.spec.ts
 1 apps/mist/src/visual/dto/query-visual-commands.dto.ts
30 apps/mist/src/sources/qmt/qmt-source.service.spec.ts
32 apps/mist/src/sources/tdx/tdx-source.service.spec.ts
 1 apps/mist/src/strategy/controllers/strategy.controller.spec.ts
 1 apps/mist/src/strategy/services/strategy-definition.service.spec.ts
 2 libs/transport/src/http/http-response.interceptor.spec.ts
 1 libs/chancore/src/chan-core.spec.ts
 1 libs/chancore/src/internal/assert-chan-k-series.spec.ts
13 libs/utils/src/security-code.spec.ts
 1 libs/realtime/README.md
 1 libs/strategy/src/factor/factor-plugin.spec.ts
```
（其中 3 个文件含「贵州茅台」：`initialize-realtime-subscription.dto.ts`、同名 spec、`realtime-subscription.service.spec.ts`）

### 4.3 mist-fe 仓（9 文件，风险：低）
```bash
cd /Users/moyui/sean/mist/mist-fe
perl -pi -e 's/600519, 000001/000001/g' app/strategies/StrategiesWorkspace.tsx
FILES=$(grep -rl "600519\|贵州茅台" app lib utils __fixtures__ __tests__)
perl -pi -e 's/贵州茅台/上证指数/g; s/茅台/上证指数/g; s/600519/000001/g' $FILES
# 契约摘要重签（contract-digest.test.ts 逐字节校验；单边编辑必挂）
cd __fixtures__/contracts/realtime-subscriptions && shasum -a 256 fixtures.json > fixtures.json.sha256
```
文件清单：
```
26 app/settings/realtime-subscriptions/__tests__/RealtimeSubscriptionsPage.test.tsx
 2 app/settings/realtime-subscriptions/page.tsx
 2 app/strategies/StrategiesWorkspace.tsx
12 app/strategies/__tests__/StrategiesPage.test.tsx
 1 app/dashboard/data/mock.ts
 1 app/dashboard/__tests__/DashboardView.test.tsx（仅「贵州茅台」）
10 app/api/__tests__/realtime-subscriptions.test.ts
25 app/api/__tests__/client.test.ts
11 __fixtures__/contracts/realtime-subscriptions/fixtures.json
```
`fixtures.json.sha256` 由 `ceb7de53…` 变为重签后的新值（属预期 diff）。

### 4.4 验证
```bash
cd /Users/moyui/sean/mist/mist-fe && npx jest __tests__/contract-digest.test.ts
pnpm -C mist-fe test && pnpm -C mist-fe typecheck && pnpm -C mist-fe lint
pnpm -C mist test:ci        # 替换涉及 27 文件（约 20+ 为 spec），必须全量回归
```

### 4.5 范围与边界（不改写）
- `docs/otel-whitebox-20260810/**`：8 月历史运维记录（600519.SH 是当时生产 allowlist 的真实事实），
  改写 = 伪造历史；
- `openspec/changes/archive/**`（冻结）、`coverage/**`、`.data/**`、`dist/**`（构建产物）；
- `test/fixtures/realtime/**`（跨仓冻结夹具）无命中，不触碰；
- `docs/openspec-gap-inventory.md` 的过期 change 表属用户维护文档，落地时一并提示（不代改）。

---

## §5 Phase 5：汇总验证

```bash
pnpm -C mist typecheck
pnpm -C mist lint:check
pnpm -C mist check:magic                 # 期望 count ≤ 基线（净下降）
pnpm -C mist test:ci                     # 全量（本机热约束 → 分批执行）
pnpm -C mist test:coverage               # ratchet: lines ≥ 82.72% / statements ≥ 81.64%
openspec validate cleanup-dead-code-env-and-restore-ci --strict
```
push 后：`gh run view <run> --json conclusion,jobs` 确认 `Validate backend` + `Build linux/amd64` 双绿
（`gh run watch` 的 exit code 不可信，照旧查 JSON 明细）。

收尾：
- tasks.md 全量勾选（1.1–1.3 附「已由 0aae2c3a 落地」证据注释）；
- 5.4 交付：`candle-degraded-event-recovery` 判定链缺失需单独立项（恢复 vs down-grade spec）
  + `docs/openspec-gap-inventory.md` / AGENTS.md 过期表提示用户。

---

## §6 落地安排

- **worktree（mist）**：`git worktree add .worktrees/cleanup-dead-code-env-restore-ci -b cleanup/dead-code-env-restore-ci`
  → `ln -s ../../node_modules node_modules`（新 worktree 无 node_modules，pnpm 脚本需软链）。
- **mist-fe**：主工作树直接落（改动小、均为夹具/测试示例）。
- **提交切分建议**：
  1. mist：`chore(cleanup): prune dead exports and schema stubs (A1–A9)`
  2. mist：`fix(config): declare read-only env keys and wire tdx heartbeat (B)`（含新增测试）
  3. mist：`chore(cleanup): retire 600519 fixtures across mist` + tasks.md 勾选 + 本计划文档
  4. mist-fe：`chore(fixtures): retire 600519 fixtures and re-pin replica digest`
- **push**：两仓 push 前逐次显式确认（共享状态）；mist push 触发 docker.yml。
- **change 归档**：全部验证绿后再执行 `openspec archive cleanup-dead-code-env-and-restore-ci`
  （合并 spec delta 进 live spec），时机待定。
- **本机约束**：test:ci / coverage 属 CPU 重活，分批执行；worktree 内跑命令优先
  `node -e "process.chdir(...); execSync(...)"` 模式。

---

## §7 确认记录（2026-10-15 用户确认，开始落地）

1. **A8 类型落点**：已确认——ingress.module `:105` 用 `RealtimeStrategyMode`（canonical 的语义别名，
   两者编译等价）；并补入 `apps/mist/src/health/health.vo.ts:18/21` 两处遗漏副本（纳入 A8）。
2. **A6 收窄范围**：按计划执行（`appEnvSchema` 整块 + `redis_server_*` 三键）。
3. **残留特例**：按计划执行（`"600519, 000001"` → `"000001"`；README Redis key 示例纳入替换）。
4. **落地方式**：mist 建 worktree（分支 `cleanup/dead-code-env-restore-ci`），mist-fe 主树；
   push 前逐次确认。
5. **Phase 1 处理**：按「已由 `0aae2c3a` 落地 → 复核 + 勾选」处理（不再写代码）。
