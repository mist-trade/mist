# Tasks: 辅助函数统一收敛与 Libs 体系系统性瘦身重构原子化任务清单

## Phase 1: 辅助函数原位收敛与纯工具扩充（零风险、纯增益）

- [x] 1.1 **扩充 `@app/utils` 基础纯原语并编写单测**
  - [x] 在 `libs/utils/src/type-guards.ts` 导出 `isValidDate(value: unknown): value is Date`
  - [x] 在 `libs/utils/src/security-code.ts` 导出 `isProviderSymbol(value: unknown): value is string` 与 `PROVIDER_SYMBOL_PATTERN`
  - [x] 新建 `libs/utils/src/error.util.ts` 导出 `toErrorMessage(error: unknown, fallback?: string): string` 并添加单测
  - [x] 新建 `libs/utils/src/async.util.ts` 导出 `sleep(ms: number)` 与 `withTimeout<T>(promise, timeoutMs, errorFactory)` 并添加单测
- [x] 1.2 **扩充 `@app/timezone` 高性能格式化与收盘判决并编写单测**
  - [x] 在 `libs/timezone/src/trading-session.util.ts` 导出高性能 `formatShanghaiDateString(date: Date): string`
  - [x] 在 `libs/timezone/src/trading-session.util.ts` 导出高性能 `formatShanghaiDateTimeString(date: Date): string`
  - [x] 在 `libs/timezone/src/trading-session.util.ts` 导出 `isSessionCloseBar(timestamp: Date, period: Period): boolean`
  - [x] 在 `libs/timezone/src/trading-session.util.spec.ts` 补充格式化与边界判定单元测试
- [x] 1.3 **全仓原位替换散落辅助函数**
  - [x] 统一 12 处散落的 `isRecord` 为直接从 `@app/utils` 引入
  - [x] 统一 8 处散落的 `validDate` 为直接使用 `@app/utils` 的 `isValidDate`
  - [x] 统一 35+ 处散落的 `error.message` 转换为 `@app/utils` 的 `toErrorMessage`
  - [x] 统一 `candle-finalized-job.processor.ts`、`notification-envelope.ts` 等处的高频 `Intl.DateTimeFormat` 为 `@app/timezone` 纯函数
  - [x] 替换 `apps/backtest/src/backtest-run.executor.ts` 中的手写 `(UTC+8)%24` 收盘判定为 `isSessionCloseBar`

---

## Phase 2: Libs 死代码清理与业务逻辑下沉（架构止血）

- [x] 2.1 **纯化 `libs/strategy/src/index.ts` 根 Barrel**
  - [x] 移除 `export { evaluateStrategyPlan }` 根导出，彻底对齐 `strategy-pipeline-homogeneity.guard.spec.ts` 门禁
  - [x] 移除对 `@app/market-data` 的 24 个倒灌 Re-exports，消费方统一从 `@app/market-data` 导入
- [x] 2.2 **物理删除 P2 级僵尸代码与废弃资产**
  - [x] 物理删除 `libs/utils/src/aggregate.ts` 及 `aggregate.spec.ts`
  - [x] 物理删除 `libs/utils/src/security-code.ts` 中重复的 `isEtfSecurity` 与 `isChiNextOrStarMarket`
  - [x] 物理删除 `libs/strategy/src/evaluation/strategy-context-snapshot.serializer.ts`
  - [x] 物理删除 `libs/strategy/src/factor/plugins/http-proxy.plugin.ts`
  - [x] 物理删除 `libs/market-data/src/market-data-pipeline.ts` 中未使用的 `MarketDataPipelineError`
  - [x] 物理删除 `libs/observability/src/metric-utils.ts` 中未使用的 2 个单测虚假活跃函数
  - [x] 清理 `libs/constants/src/errors.ts` 中 23 个悬空常量与 `market.constants.ts` 中的过时费率
- [x] 2.3 **剥离 `libs/utils` 业务倒灌并解除与 `libs/timezone` 的双向循环依赖**
  - [x] 将 `libs/utils/src/services/` 下的 4 个服务物理迁移至 `apps/mist/src/sources/services/`
  - [x] 更新 `apps/mist/src/sources/sources.module.ts` 注册这 4 个服务
  - [x] 彻底移除 `libs/utils/src/utils.module.ts` 中的 `@Global()` 声明与 TypeORM 实体引入
  - [x] 改造 `TimezoneService` 中 Axios 实例的创建方式，彻底切断 `libs/utils` 与 `libs/timezone` 的循环依赖

---

## Phase 3: 微库合并、推流器回归与门禁对账（紧凑重组）

- [x] 3.1 **合并 `libs/observability` 至 `libs/transport`**
  - [x] 将 `base-health.vo.ts` 与 `metric-utils.ts` 迁入 `libs/transport/src/observability/`
  - [x] 更新各微服务 Health Controller 引用路径为 `@app/transport`
  - [x] 移除 `libs/observability` 独立目录
- [x] 3.2 **建立 `libs/contracts` 整合分散微契约**
  - [x] 创建 `libs/contracts/` 目录与 tsconfig
  - [x] 迁移 `libs/backtest`（49L）至 `libs/contracts/src/backtest/`
  - [x] 迁移 `libs/realtime`（271L）至 `libs/contracts/src/realtime/`
  - [x] 迁移 `libs/signal/src/contracts/` 至 `libs/contracts/src/signal/`
  - [x] 物理删除 `libs/backtest` 与 `libs/realtime` 微库
- [x] 3.3 **推流适配器回归 `libs/strategy`**
  - [x] 将 `RealtimeKernelPool` 与 `RealtimePeriodBuilder` 迁至 `libs/strategy/src/kernel/adapters/`
  - [x] 更新 `libs/strategy/src/strategy-pipeline-homogeneity.guard.spec.ts`，消除反向导入 `@app/signal`
- [x] 3.4 **工程配置更新与全量 CI 门禁对账**
  - [x] 同步对齐更新 `tsconfig.json`、`nest-cli.json`、`package.json` 中的 paths 映射
  - [x] 执行三大架构刚性门禁测试全绿通过（`dev-server-boundary`, `homogeneity`, `dual-timestamp`）
  - [x] 执行全仓类型检查 `typecheck` 0 报错
  - [x] 执行单元测试全绿通过

