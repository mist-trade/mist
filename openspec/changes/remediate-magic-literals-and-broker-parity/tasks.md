# Tasks: 魔法数字四层分界治理与经纪商因果缺陷修复原子化任务清单

## Phase 1: 高危缺陷修复与因果闭环（优先止血）

- [x] 1.1 **修复标的代码识别正则与法定交易规则漏判**
  - [x] 在 `libs/market-data/src/price-limit.util.ts` 中修正 `isEtfSecurity`，覆盖 `516/517/56x`，杜绝 ETF 卖出误征印花税
  - [x] 在 `libs/market-data/src/price-limit.util.ts` 中修正 `isChiNextOrStarMarket`，覆盖 `689` 科创板 CDR
  - [x] 增加北交所（`0.30`）与 ST（`0.05`）涨跌幅规则判定函数
  - [x] 在 `libs/market-data/src/price-limit.util.spec.ts` 补充针对上述号段的完整单元测试
- [x] 1.2 **修复回测主循环 T+1 跨日解冻失效 Bug**
  - [x] 在 `apps/backtest/src/backtest-run.executor.ts` 的 `isSessionCloseBar` 逻辑中补齐 `this.broker.settleDayClose(formatShanghaiDateString(bar.timestamp))`
  - [x] 在 `apps/backtest/src/backtest-closed-loop.spec.ts` 编写跨日多空交易用例，断言跨日卖出不会被 `T1_LOCKED_SHARES` 拒单
- [x] 1.3 **修复持仓状态机 UTC 日期截取与全仓时间工具收敛**
  - [x] 将 `libs/strategy/src/position/position-state-machine.ts` 中的 `.toISOString().slice(0, 10)` 替换为 `@app/timezone` 的 `formatShanghaiDateString`
  - [x] 将 `libs/market-data/src/projection/strategy-series-imputer.ts` 中的手写 `Intl.DateTimeFormat` 替换为 `@app/timezone` 导出工具
  - [x] 统一散落的时区字符串为直接引用 `ASIA_SHANGHAI_TIMEZONE`
- [x] 1.4 **增加策略告警事件全表查询分页保护**
  - [x] 在 `apps/mist/src/strategy/services/strategy-alert-event.service.ts` 增加强制 limit 约束（默认 50，上限 100），杜绝全表扫描打爆内存


---

## Phase 2: 法定规则与纯数学常量规范化提取（不变基石）

- [x] 2.1 **法定规则下沉集中至 `@app/constants`**
  - [x] 扩充 `libs/constants/src/market.constants.ts` 中的 `TRADING_RULES`（包含整手 100、过户费率、印花税率、各板块涨跌幅）
  - [x] 更新 `slippage-fee-calculator.ts` 与 `simulated-broker.ts` 引用 `@app/constants` 的 `TRADING_RULES`
- [x] 2.2 **纯数学与算法数值稳定性防护**
  - [x] 在 `libs/indicators/src/performance/performance.ts` 为 `computeCalmarRatio` 增加 `CALMAR_MIN_DRAWDOWN_EPSILON = 1e-4` 与 `MAX_CALMAR_RATIO_CAP = 999.0`，添加极小回撤测试
  - [x] 在 `libs/indicators/src/fibonacci/fibonacci.ts` 消除裸写字面量，统一引用 `DEFAULT_FIBONACCI_*` 与黄金分割常量
- [x] 2.3 **缠论几何公理具名常量化**
  - [x] 在 `libs/chancore/src/internal/channel-lifecycle.ts` 导出 `CHAN_ZHONGSHU_UPGRADE_NINE_UNITS = 9` 与 `CHAN_ZHONGSHU_EXTENSION_MIN_UNITS = 4`
  - [x] 替换 `duan-channel.ts` 与 `duan-channel-policy.ts` 中散落的 7 处裸数字 `9` 和 `4`
  - [x] 在 `libs/chancore/src/internal/bi.ts` 提取 `CHAN_FENXING_ELEMENT_COUNT = 3` 与宽笔间距门槛


---

## Phase 3: 策略/回测业务可调参数接口化（按需配置）

- [x] 3.1 **定义经纪商执行选项与费率配置接口**
  - [x] 在 `libs/strategy/src/execution/execution.types.ts` 定义 `BrokerFeeConfig` 与 `BrokerExecutionOptions`
  - [x] 改造 `SimulatedBroker` 构造函数接收 `options?: BrokerExecutionOptions`，支持自定义初始资金、滑点与佣金率（支持免五）
  - [x] 改造 `calculateExecutionFees` 接收可选的 `BrokerFeeConfig`
  - [x] 在 `simulated-broker.spec.ts` 增加免五与自定义费率单测验证
- [x] 3.2 **MACD 指标入参配置化**
  - [x] 在 `libs/indicators/src/macd.ts` 增加 `MacdOptions` 接口
  - [x] 提取 `DEFAULT_MACD_FAST = 12`, `DEFAULT_MACD_SLOW = 26`, `DEFAULT_MACD_SIGNAL = 9`，动态计算最小要求长度
  - [x] 补充自定义周期 MACD 的单元测试
- [x] 3.3 **持仓状态机支持平仓比例配置**
  - [x] 在 `PositionStateMachine` 引入 `exitRatio = 1.0` 配置支持，补充部分平仓单测

---

## Phase 4: 运行时工程参数收敛与防爆（工程整洁）

- [x] 4.1 **统一内部微服务 RPC 超时与公共周期**
  - [x] 在 `@app/transport` 导出 `DEFAULT_INTERNAL_RPC_TIMEOUT_MS = 3_000`
  - [x] 消除 `apps/signal` 内部 3 处散落的 `[1, 5, 15, 30, 60]`，统一引用 `@app/strategy` 的 `REALTIME_STRATEGY_PERIODS`
  - [x] 收敛 `SAFE_FAILURE_CODES` 至 `@app/contracts`
- [x] 4.2 **本地开发推演网关容量防爆与磁盘清理**
  - [x] 在 `tools/strategy-dev/server.ts` 引入 `MAX_DEV_SESSIONS = 10` 容量限制
  - [x] 为快照落盘增加轮转修剪（最多保留最近 20 份），避免磁盘膨胀

---

## Phase 5: 架构门禁、AST 审计与全量验证

- [x] 5.1 **创建时区规范刚性门禁并全绿通过**
  - [x] 新建 `libs/timezone/src/timezone-boundary.guard.spec.ts`，静态扫描全仓禁止私写时间格式化与时区
  - [x] 运行该门禁确保 100% 拦截并全绿通过
- [x] 5.2 **执行全量架构刚性门禁测试**
  - [x] `dev-server-boundary.guard.spec.ts` 100% 保持全绿
  - [x] `strategy-pipeline-homogeneity.guard.spec.ts` 100% 保持全绿
  - [x] `strategy-dual-timestamp.guard.spec.ts` 100% 保持全绿
- [x] 5.3 **执行 AST 魔法数字审计检查**
  - [x] 运行 `pnpm check:magic`（或更新 audit 脚本规则）确保新增常量完全符合 AST 门禁
- [x] 5.4 **全仓单测与类型检查全绿通过**
  - [x] 执行全仓 `typecheck` 0 报错
  - [x] 运行受影响模块单元测试全绿通过

