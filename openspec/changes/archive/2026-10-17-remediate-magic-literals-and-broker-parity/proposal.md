# Proposal: 魔法数字四层分界治理与经纪商因果缺陷修复

## 1. 背景与核心痛点

在系统快速演进并完成回测闭环（`unify-quant-pipeline-architecture` 与 `consolidate-utils-and-prune-libs`）后，代码库在执行层、状态机、指标层、几何层及微服务运行时散落了大量裸数字（Magic Numbers）与硬编码。

经多 Agent 全景调研与交叉审计，发现当前代码存在四类严重问题：

1. **混淆“常量提取”与“配置化”，缺乏分层定界标准**：
   - 部分本应做成策略/回测可调参数的业务项（如券商佣金万 2.5、最低 5 元保底、回测冲击滑点 0.1%、MACD 的 12/26/9 周期、持仓 100% 全平）被彻底写死在底层算子与执行器中，外部无法自定义或模拟“免五”大客户账户；
   - 部分属于不可篡改的法定交易规则（如主板整手 100 股、过户费万 0.1）或纯数学定理（缠论 3 元素分型、九段中枢延伸升级），若盲目全部暴露为用户配置，将造成配置地狱（Config Bloat）与非法状态空间；
2. **高危法定规则缺陷与税费误征（漏判）**：
   - [`price-limit.util.ts`](file:///Users/moyui/sean/mist/mist/libs/market-data/src/price-limit.util.ts#L12-L17) 中的 ETF 判定正则 `/^(51[0-358]|588|159)\d{3}$/` 严重遗漏了上交所大量真实存在的 `516xxx`（产业 ETF）、`517xxx`（港股通 ETF）与 `56xxxx` 系列 ETF，导致这些真实 ETF 标的在撮合卖出时被**错误征收印花税**；
   - 涨跌幅比例缺少对 ST/ *ST 股票（5%）与北交所（30%）的覆盖，且双创板代码正则漏判 `689xxx`（科创板 CDR）；
3. **回测主循环因果断层（T+1 跨日解冻失效）**：
   - [`backtest-run.executor.ts`](file:///Users/moyui/sean/mist/mist/apps/backtest/src/backtest-run.executor.ts#L457-L459) 在每日收盘分支仅调用了 `positionMachine.onDayClose(bar)`，**遗漏了调用 `broker.settleDayClose()`**，导致跨日持仓在 `SimulatedBroker` 中永久处于冻结状态（`frozenQuantity` 未清零移入 `availableQuantity`），次日策略卖出被误判 `T1_LOCKED_SHARES` 拒单；
4. **时区跨日偏差与微服务运行时隐患**：
   - [`position-state-machine.ts`](file:///Users/moyui/sean/mist/mist/libs/strategy/src/position/position-state-machine.ts#L204-L206) 使用 `bar.timestamp.toISOString().slice(0, 10)` 截取 UTC 日期，临界点存在跨日偏差；
   - [`strategy-alert-event.service.ts`](file:///Users/moyui/sean/mist/mist/apps/mist/src/strategy/services/strategy-alert-event.service.ts#L26-L29) 列表查询无任何 `take/limit` 分页保护，生产长期累积后有全表扫描打爆内存隐患；
   - [`server.ts`](file:///Users/moyui/sean/mist/mist/tools/strategy-dev/server.ts#L701) 推演会话 Map 无容量上限，存在 OOM 风险。

---

## 2. 目标与范围（Scope & Goals）

### 2.1 核心目标

1. **建立“四层分界治理模型”并执行分级重构**：
   - **第一层（数学与几何公理）**：提取具名不可变常量，修复卡玛比率分母极小值除以零爆炸（引入安全 epsilon 与 999.0 截断），统一斐波那契常量引用，提取缠论九段中枢延伸升级（9）与三笔线段（3）常量；
   - **第二层（法定交易规则）**：统一下沉至 `@app/constants` 的 `TRADING_RULES`，补齐 ST 5%、北交所 30% 涨跌幅限制及科创板 CDR 正则；修复 ETF 判定正则，杜绝误征印花税；
   - **第三层（策略与回测业务可调参数）**：抽象 `BrokerFeeConfig` / `BrokerExecutionOptions`，支持佣金率、最低佣金（支持免五为 0）、滑点率与初始资金配置传入；为 `computeMacdSeries` 增加 `MacdOptions` 接口并绑定标准默认常量；持仓状态机支持平仓比例 `exitRatio`；
   - **第四层（基础设施运行时工程配置）**：统一微服务 RPC 超时基准（3000ms）、统一日内支持周期、为告警事件查询增加强制分页门禁、为推演会话增加 `MAX_DEV_SESSIONS` 容量保护。
2. **闭环修复回测因果律与时区断层**：
   - 在 `backtest-run.executor.ts` 收盘分支补齐 `broker.settleDayClose()`；
   - 将持仓状态机中的 `.slice(0, 10)` 替换为上海时区格式化工具 `formatShanghaiDateString`。
3. **架构门禁与测试 100% 保持全绿**：
   - dev-server-boundary、pipeline-homogeneity、dual-timestamp 守门全绿，单测与类型检查全绿。

### 2.2 非目标（Out of Scope）

- **不重构复杂交易指令**：暂不实现条件单、冰山单或止损挂单，维持 Next-Bar 因果市价撮合；
- **不变更生产 242 桶规范**：交易时段维持现行的左标半开区间扩展规范；
- **不随意暴露不可配置项**：严禁将第一层数学定理与第二层法定制度做成动态配置。
