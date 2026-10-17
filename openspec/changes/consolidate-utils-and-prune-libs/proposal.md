# Proposal: 辅助函数统一收敛与 Libs 体系系统性瘦身重构

## 1. 背景与核心痛点

在系统长期快速演进过程中，代码库累积了大量的工具类、辅助函数以及微型库配置。经多 Agent 全仓 100% 静态扫描与交叉审计，发现当前系统在工具抽象与底层 Libs 组织上存在两大类深层架构问题：

1. **辅助函数四处散落、严重复制与性能浪费**：
   - **类型守卫割裂**：全仓多达 12 处私自手写 `isRecord`，8 处手写 `isValidDate`，标的正则格式在 QMT、TDX、订阅生命周期三处各自手写，存在边界分叉风险；
   - **高频时区格式化开销**：北京时间格式化存在 5 种不同写法，在实时行情推流与 BullMQ 任务中高频逐帧 `new Intl.DateTimeFormat`，引发剧烈的 V8 GC 压力；
   - **异常提取样板代码泛滥**：全仓存在 35+ 处手写 `error instanceof Error ? error.message : String(error)`；
   - **跨 App 违规相对路径引用**：交易会话与 242 桶划分逻辑锁在 `apps/mist`，导致 `apps/signal` 产生违规相对路径导入（`import ... from '../../../mist/src/...'`）。

2. **`libs/` 体系虚胖、业务倒灌与微库碎片化**：
   - **`libs/utils` 严重名不副实**：其内部声明了 `@Global()` 并引入了 TypeORM `Repository<SecuritySourceConfig>`，注入了数据库！把仅服务于 `apps/mist` 的采集调度和分时切片硬塞入基础工具库，导致它与 `libs/timezone` 发生全仓唯一的**双向循环依赖**；
   - **微库极端碎片化 (S6 坏味道)**：`libs/backtest`（仅 49 行代码）、`libs/observability`（仅 65 行代码）、`libs/realtime`（仅 271 行代码）均为极端单薄的空壳微库，徒增维护负担与构建开销（曾因与 app 重名引发编译冲突）；
   - **死代码与违规根导出**：`libs/strategy/src/index.ts` 根 barrel 导出了被 CI 架构门禁明令禁止外部调用的 `evaluateStrategyPlan`，且跨库倒灌 re-export 了 24 个原本属于 `@app/market-data` 的类型；`libs/constants/src/errors.ts`（26 个常量有 23 个生产 0 引用，全库 0 单测）；`libs/utils/src/aggregate.ts` 生产 0 引用。

---

## 2. 目标与范围（Scope & Goals）

### 2.1 核心目标

1. **统一收敛公共基础原语至 `@app/utils` 与 `@app/timezone`**：
   - 扩充并标准化：`isValidDate`、`isRecord`、`isProviderSymbol`、`toErrorMessage`、`withTimeout`、`sleep`、`formatShanghaiDateString`、`formatShanghaiDateTimeString`；
   - 原位替换全仓散落的 12 处 `isRecord`、8 处 `isValidDate`、35+ 处 `error.message` 以及高频 `Intl.DateTimeFormat`。
2. **彻底解耦与净化 `libs/utils`**：
   - 将采集与数据源业务（`DataSourceSelectionService`、`DataSourceService`、`PeriodMappingService`、`KBoundaryCalculator`）下沉至 `apps/mist/src/sources/`；
   - 彻底移除 `libs/utils` 中的 `@Global()` 装饰器、TypeORM 依赖与数据库连接，还原为 100% 纯函数工具库；
   - 彻底切断 `libs/utils` 与 `libs/timezone` 之间的双向循环依赖。
3. **物理清理 P1/P2 级死代码与违规导出**：
   - 剔除 `libs/strategy/src/index.ts` 中违规暴露的 `evaluateStrategyPlan` 及 24 个 `@app/market-data` 倒灌 Re-exports；
   - 物理删除 `aggregate.ts`、`type-guards.ts` 中的悬空导出、`serializeStrategyContextSnapshot`、`HttpProxyFactorPlugin` 空壳、`MarketDataPipelineError` 僵尸类以及 23 个悬空错误常量。
4. **重构微库并紧凑化 Libs 体系**：
   - 将 `libs/observability`（65L）并入 `libs/transport/src/observability/`；
   - 将 `libs/backtest`（49L）与 `libs/realtime`（271L）以及 `libs/signal/src/contracts/` 整合为单一通信契约库 `libs/contracts`；
   - 将 `RealtimeKernelPool` 迁回 `libs/strategy`，解开反向门禁测试依赖；
   - **将当前 16 个 libs 紧凑精简至 11~12 个**，消除微库碎片化。
5. **刚性架构门禁 100% 保持通过**：
   - dev-server-boundary、pipeline-homogeneity、dual-timestamp 三大门禁持续守门全绿。

### 2.2 非目标（Out of Scope / Negative Scope）

- **禁止收敛持久化 Helper**：`apps/mist/src/sources/k-save.helper.ts` 等强耦合 TypeORM `EntityManager` 的函数继续内聚在业务模块内部，坚决不进入工具库；
- **禁止收敛驱动级私有报文适配**：QMT/TDX 的 native frame 转换器继续保留在各自适配器内；
- **禁止收敛控制器 VO 转换与本地开发网关胶水**：`chan-core.mapper.ts` 与 `tools/strategy-dev/server.ts` 继续保留在表现层与薄网关。

---

## 3. 关联影响与收益

- **代码体积与认知成本**：物理删除 500+ 行死代码与僵尸资产，消灭 4 个独立小微库的目录、tsconfig 及构建条目；
- **架构纯度与解耦**：底层工具库不再背负 ORM，全仓循环依赖归零；
- **运行性能提升**：消除高频推流与任务处理中的频繁 `Intl.DateTimeFormat` 对象实例化开销。
