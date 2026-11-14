# Design: 魔法数字四层分界治理与经纪商因果缺陷修复技术方案

## 1. 架构定界与四层模型

```
┌────────────────────────────────────────────────────────────────────────┐
│ 第一层：纯数学与几何公理不变量 (Math & Geometric Invariants)             │
│ • 范围：@app/chancore, @app/indicators (performance, fibonacci)        │
│ • 原则：不可作为配置暴露。提取为具名语义常量或公式内置。                 │
├────────────────────────────────────────────────────────────────────────┤
│ 第二层：法定交易制度与规则不变量 (Statutory Market Domain Invariants)    │
│ • 范围：@app/constants (TRADING_RULES), @app/market-data              │
│ • 原则：不作为用户动态配置。统一下沉至基础规则包，保持单点维护。           │
├────────────────────────────────────────────────────────────────────────┤
│ 第三层：策略与回测业务可调参数 (Strategy & Backtest Tuning Parameters)  │
│ • 范围：@app/strategy (execution, position), BacktestRunSubmitDto     │
│ • 原则：作为可选配置对象暴露，提供工业级标准默认常量，避免调用方裸写。     │
├────────────────────────────────────────────────────────────────────────┤
│ 第四层：基础设施运行时工程配置 (Infrastructure Runtime & System Config)   │
│ • 范围：apps/*, tools/*, @app/transport (rpc)                          │
│ • 原则：走 ConfigService/Env，提供常量 fallback，防内存/磁盘无界泄漏。  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心技术方案设计

### 2.1 第三层：经纪商执行配置与回测参数契约

在 `libs/strategy/src/execution/execution.types.ts` 定义经纪商费率与撮合配置：

```typescript
export interface BrokerFeeConfig {
  /** 佣金费率，默认 0.00025（万 2.5） */
  readonly commissionRate?: number;
  /** 最低佣金，默认 5 元；大客户免五账户可设为 0 */
  readonly minCommission?: number;
  /** 过户费率，默认 0.00001（万 0.1），一般为法定 */
  readonly transferFeeRate?: number;
  /** 印花税率，默认 0.0005（万 5），仅卖出征收，ETF 免征 */
  readonly stampDutyRate?: number;
}

export interface BrokerExecutionOptions {
  /** 账户初始资金，默认 1,000,000 */
  readonly initialCash?: number;
  /** 冲击滑点比例，默认 0.001（千分之 1） */
  readonly slippageRatio?: number;
  /** 费率设置 */
  readonly feeConfig?: BrokerFeeConfig;
}
```

- `SimulatedBroker` 构造函数接收 `BrokerExecutionOptions`，并将其注入 `slippage-fee-calculator`；
- `BacktestRunSubmitContract` / DTO 增加可选字段 `initialCash`, `slippageRatio`, `commissionRate`, `minCommission`；
- `computeMacdSeries` 扩充入参 `options?: MacdOptions`：
  ```typescript
  export interface MacdOptions {
    readonly fastPeriod?: number; // default: 12
    readonly slowPeriod?: number; // default: 26
    readonly signalPeriod?: number; // default: 9
  }
  ```

### 2.2 第二层：法定交易规则下沉与缺陷修复

1. **下沉法定规则至 `@app/constants` 的 `TRADING_RULES`**：
   ```typescript
   export const TRADING_RULES = Object.freeze({
     MAIN_BOARD_LOT_SIZE: 100,
     CHINEXT_STAR_LIMIT_RATIO: 0.2,
     MAIN_BOARD_LIMIT_RATIO: 0.1,
     ST_LIMIT_RATIO: 0.05,
     BSE_LIMIT_RATIO: 0.3,
     TRANSFER_FEE_RATE: 0.00001,
     STAMP_DUTY_RATE: 0.0005,
   } as const);
   ```
2. **修复 ETF 与双创/北交所代码识别正则**：
   - 修复 ETF 正则漏判 `516/517/56x` 系列：
     ```typescript
     export const ETF_SECURITY_PATTERN = /^(51[0-8]|56[0-3]|588|159)\d{3}$/;
     ```
   - 扩充科创板 CDR `689xxx` 与北交所识别：
     ```typescript
     export const CHINEXT_STAR_SECURITY_PATTERN = /^(30[01]|68[89])\d{3}$/;
     export const BSE_SECURITY_PATTERN = /^(43|83|87|92)\d{4}$/;
     ```

### 2.3 第一层：纯数学与算法数值稳定性

1. **卡玛比率分母安全 Epsilon 与封顶**：
   ```typescript
   export const CALMAR_MIN_DRAWDOWN_EPSILON = 1e-4;
   export const MAX_CALMAR_RATIO_CAP = 999.0;
   ```
   当 `maxDrawdown < CALMAR_MIN_DRAWDOWN_EPSILON` 时，截断为 `MAX_CALMAR_RATIO_CAP`，避免微小波动导致比率失真。
2. **缠论九段延伸与三笔线段公理常量化**：
   - 在 `channel-lifecycle.ts` 导出：
     ```typescript
     export const CHAN_ZHONGSHU_EXTENSION_MIN_UNITS = 4;
     export const CHAN_ZHONGSHU_UPGRADE_NINE_UNITS = 9;
     ```
   - 在 `duan.ts` 导出 `CHAN_DUAN_MIN_BI_COUNT = 3`；
   - 在 `bi.ts` 导出 `CHAN_WIDE_BI_MIN_INTERMEDIATE_K_COUNT = 3`。
3. **斐波那契常量对齐**：
   - 使用已声明的 `FIBONACCI_RETRACEMENT_RATIOS` 与 `DEFAULT_FIBONACCI_*` 替换 `fibonacci.ts` 中的字面量。

### 2.4 第四层：基础设施运行时工程配置与防泄漏

1. **API 分页强制保护**：
   - 在 `StrategyAlertEventService` 中强制引入 `@Max(100)`、默认 50 分页门禁；
   - 在 `@app/constants` 统一定义 `DEFAULT_API_PAGE_LIMIT = 50`, `MAX_API_PAGE_LIMIT = 100`。
2. **微服务 RPC 超时统一步调**：
   - 在 `@app/transport` 导出 `DEFAULT_INTERNAL_RPC_TIMEOUT_MS = 3_000`。
3. **本地开发网关容量防爆**：
   - 在 `tools/strategy-dev/server.ts` 引入 `MAX_ACTIVE_DEV_SESSIONS = 10` 容量限制，防内存爆满；
   - 自动清理过期快照文件（最多保留 20 份），防止 `.data/` 目录磁盘无界膨胀。

### 2.5 闭环修复回测因果律与时区断层

1. **在 `backtest-run.executor.ts` 补齐日结跨日解冻调用**：
   ```typescript
   if (isSessionCloseBar(bar.timestamp, run.period)) {
     positionMachine.onDayClose(bar);
     broker.settleDayClose(formatShanghaiDateString(bar.timestamp));
   }
   ```
2. **修复持仓状态机 UTC 日期截取**：
   - 彻底废弃 `bar.timestamp.toISOString().slice(0, 10)`，改为统一调用 `formatShanghaiDateString(bar.timestamp)`。

### 2.6 刚性门禁：全仓时区与日期规范守门 (Timezone Architectural Guard)

全仓严禁私自手写时间格式化与时区处理，必须强制收敛至 `@app/timezone`：
1. **静态扫描守门 (`libs/timezone/src/timezone-boundary.guard.spec.ts`)**：
   - 严禁在 `libs/timezone` 以外私自 `new Intl.DateTimeFormat` 进行时区格式化；
   - 严禁通过 `.toISOString().slice(0, 10)` 或 `.toISOString().split('T')[0]` 提取交易日（存在 UTC 跨日 bug）；
   - 严禁散落手写字面量 `'Asia/Shanghai'`，必须统一引入 `ASIA_SHANGHAI_TIMEZONE`；
   - 严禁手写连续竞价小时/分钟判定，统一调用 `isSessionCloseBar` / `isTradingSession`。
2. **CI 刚性门禁集成**：
   - 作为独立 Jest 测试在 CI / `pnpm test` 中全自动执行，任何违规手写时间逻辑直接熔断红灯。

