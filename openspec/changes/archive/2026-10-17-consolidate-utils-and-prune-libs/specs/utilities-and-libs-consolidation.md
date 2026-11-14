# Spec: 辅助函数收敛与 Libs 治理规格增量 (Delta Spec)

## 1. `@app/utils` 领域规约变更

### 1.1 新增/规范公共纯函数守卫
- `isRecord(value: unknown): value is Record<string, unknown>` 必须作为通用对象守卫，排除 `null` 与 `Array`。
- `isValidDate(value: unknown): value is Date` 必须严格校验 `instanceof Date` 且 `Number.isFinite(getTime())`。
- `isProviderSymbol(value: unknown): value is string` 必须统一校验 `^(?:\d{6}\.(?:SH|SZ|BJ)|\d{5,6}\.HK)$`。
- `toErrorMessage(error: unknown, fallback?: string): string` 必须安全处理 Error 实例、包含 message 属性的对象以及非 Error 原始值。
- `withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorFactory?: () => Error): Promise<T>` 必须保证在任何结果（resolve/reject）下均立即注销定时器。

### 1.2 物理删除废弃模块
- 移除 `aggregate.ts`（包含 `minMaxBy`, `minBy`, `maxBy`）。
- 移除 `utils.module.ts` 中的 `@Global()` 声明与 TypeORM 模块引入。
- 移除 `DataSourceSelectionService`, `DataSourceService`, `PeriodMappingService`, `KBoundaryCalculator`。

---

## 2. `@app/timezone` 格式化规约变更

### 2.1 规范交易时区格式化
- `formatShanghaiDateString(date: Date): string` 必须保证输出 `YYYY-MM-DD` 格式，且禁止逐次实例化 `Intl.DateTimeFormat`。
- `formatShanghaiDateTimeString(date: Date): string` 必须保证输出 `YYYY-MM-DD HH:mm` 格式。
- `isSessionCloseBar(timestamp: Date, period: Period): boolean` 必须精确识别北京时间 15:00 的日线收盘 Bar。

---

## 3. `libs/strategy` 根导出纯化规约

### 3.1 消除违规导出
- `libs/strategy/src/index.ts` 严禁导出 `evaluateStrategyPlan`。
- `libs/strategy/src/index.ts` 严禁 re-export `@app/market-data` 下属的任何类与类型（统一强制全仓直接引用 `@app/market-data`）。

---

## 4. Libs 微库拓扑规约

### 4.1 契约统一中枢 (`@app/contracts`)
- 全系统 RPC 与 Redis 传输契约必须统一由 `@app/contracts` 提供导出，严禁为单一命令或存储格式创建独立的单文件 Lib。
- 废弃并移除独立的 `libs/backtest` 与 `libs/realtime` 库。

### 4.2 观测契约内联 (`@app/transport`)
- `BaseHealthVo` 与 OTel 注册辅助原语统一由 `@app/transport` 导出。
- 废弃并移除独立的 `libs/observability` 库。
